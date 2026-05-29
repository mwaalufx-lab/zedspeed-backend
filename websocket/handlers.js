const { updateDriverLocation, removeDriver, getNearbyDrivers, setDriverOnlineStatus, setDriverInTrip } = require('../services/matching');
const { isSubscriptionActive } = require('../services/subscription');
const { logEvent } = require('../utils/logger');

const activeRequests = new Map(); // request_id -> { passengerId, pickup, destination, tripId, expiresAt, driversNotified, assigned }

module.exports = (socket, io, db, passengerSockets) => {
    const userId = socket.user.id;
    const role = socket.user.role;

    // Driver: go online
    socket.on('go_online', async () => {
        if (role !== 'driver') return;
        const active = await isSubscriptionActive(db, userId);
        if (!active) {
            socket.emit('error', { code: 'SUBSCRIPTION_REQUIRED', message: 'Active subscription required' });
            return;
        }
        setDriverOnlineStatus(userId, true);
        socket.emit('status_updated', { online: true });
    });

    socket.on('go_offline', () => {
        if (role !== 'driver') return;
        setDriverOnlineStatus(userId, false);
        socket.emit('status_updated', { online: false });
    });

    // Driver location updates
    socket.on('location_update', async (data) => {
        if (role !== 'driver') return;
        const { lat, lng, heading, speed } = data;
        const driverOnline = true; // you could check a flag
        const inTrip = false; // simplified: track via trip status
        updateDriverLocation(userId, lat, lng, socket.id, driverOnline, inTrip);
        await db.query(
            `INSERT INTO driver_locations (driver_id, lat, lng, heading, speed, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (driver_id) DO UPDATE SET lat=$2, lng=$3, heading=$4, speed=$5, updated_at=NOW()`,
            [userId, lat, lng, heading, speed]
        );
        logEvent(userId, 'location_update', data, 'incoming');
    });

    // Passenger ride request
    socket.on('ride_request', async (data) => {
        if (role !== 'passenger') return;
        const { pickup, destination } = data;
        const requestId = `req_${Date.now()}_${userId}`;

        const tripRes = await db.query(
            `INSERT INTO trips (passenger_id, request_id, pickup_lat, pickup_lng, pickup_address,
                                dest_lat, dest_lng, dest_address, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'searching')
             RETURNING id`,
            [userId, requestId, pickup.lat, pickup.lng, pickup.address,
             destination.lat, destination.lng, destination.address]
        );
        const tripId = tripRes.rows[0].id;

        socket.emit('ride_request_ack', { request_id: requestId, status: 'searching' });

        const nearby = getNearbyDrivers(pickup.lat, pickup.lng, 5);
        if (nearby.length === 0) {
            setTimeout(() => {
                socket.emit('no_drivers_found', { request_id: requestId, reason: 'timeout' });
                db.query(`UPDATE trips SET status='cancelled_by_passenger' WHERE id=$1`, [tripId]);
            }, 30000);
            return;
        }

        activeRequests.set(requestId, {
            passengerId: userId,
            pickup,
            destination,
            tripId,
            expiresAt: Date.now() + 30000,
            driversNotified: nearby.map(d => d.driverId),
            assigned: false
        });

        for (const driver of nearby) {
            io.to(driver.socketId).emit('incoming_ride', {
                request_id: requestId,
                pickup,
                destination,
                distance_km: driver.distance,
                estimated_fare: Math.round(driver.distance * 2.5),
                expires_at: Math.floor(Date.now() / 1000) + 30
            });
        }

        setTimeout(async () => {
            const req = activeRequests.get(requestId);
            if (req && !req.assigned) {
                activeRequests.delete(requestId);
                socket.emit('no_drivers_found', { request_id: requestId, reason: 'timeout' });
                await db.query(`UPDATE trips SET status='cancelled_by_passenger' WHERE id=$1`, [req.tripId]);
            }
        }, 30000);
    });

    // Driver accepts ride
    socket.on('ride_accept', async (data) => {
        if (role !== 'driver') return;
        const { request_id } = data;
        const request = activeRequests.get(request_id);
        if (!request) {
            socket.emit('accept_rejected', { request_id, reason: 'expired' });
            return;
        }
        if (request.assigned) {
            socket.emit('accept_rejected', { request_id, reason: 'already_assigned' });
            return;
        }

        request.assigned = true;
        const driverId = userId;
        const tripId = request.tripId;

        await db.query(`UPDATE trips SET driver_id=$1, status='assigned' WHERE id=$2`, [driverId, tripId]);

        const driverInfo = await db.query(
            `SELECT u.name, d.vehicle_model, d.vehicle_plate
             FROM drivers d JOIN users u ON d.user_id = u.id
             WHERE d.user_id = $1`,
            [driverId]
        );
        const passengerSocketId = passengerSockets.get(request.passengerId);
        if (passengerSocketId) {
            io.to(passengerSocketId).emit('driver_assigned', {
                trip_id: `trip_${tripId}`,
                driver: {
                    name: driverInfo.rows[0].name,
                    vehicle: driverInfo.rows[0].vehicle_model,
                    plate: driverInfo.rows[0].vehicle_plate,
                },
                eta_seconds: 180,
                pickup: request.pickup
            });
        }

        for (const dId of request.driversNotified) {
            if (dId !== driverId) {
                const driverSock = getDriverSocket(dId);
                if (driverSock) io.to(driverSock).emit('ride_cancelled', { request_id, reason: 'accepted_by_other' });
            }
        }

        socket.emit('ride_assigned', { request_id, driver_id: driverId, trip_id: `trip_${tripId}` });
        activeRequests.delete(request_id);
    });

    // Trip lifecycle
    socket.on('start_trip', async (data) => {
        if (role !== 'driver') return;
        const { trip_id } = data;
        const numericId = parseInt(trip_id.split('_')[1]);
        await db.query(`UPDATE trips SET status='in_progress', started_at=NOW() WHERE id=$1`, [numericId]);
        setDriverInTrip(userId, true);
        const trip = await db.query(`SELECT passenger_id FROM trips WHERE id=$1`, [numericId]);
        const passengerSock = passengerSockets.get(trip.rows[0].passenger_id);
        if (passengerSock) {
            io.to(passengerSock).emit('trip_started', { trip_id, start_time: Math.floor(Date.now()/1000) });
        }
    });

    socket.on('end_trip', async (data) => {
        if (role !== 'driver') return;
        const { trip_id } = data;
        const numericId = parseInt(trip_id.split('_')[1]);
        await db.query(`UPDATE trips SET status='completed', completed_at=NOW() WHERE id=$1`, [numericId]);
        setDriverInTrip(userId, false);
        const trip = await db.query(`SELECT passenger_id FROM trips WHERE id=$1`, [numericId]);
        const passengerSock = passengerSockets.get(trip.rows[0].passenger_id);
        if (passengerSock) {
            io.to(passengerSock).emit('trip_completed', {
                trip_id,
                distance_km: 8.5,
                duration_minutes: 15,
                fare_estimated: 25,
                payment_method: 'cash'
            });
        }
        socket.emit('trip_ended_ack', { trip_id, status: 'completed' });
    });

    socket.on('disconnect', () => {
        if (role === 'driver') {
            removeDriver(userId);
        }
        console.log(`User ${userId} disconnected`);
    });
};

function getDriverSocket(driverId) {
    // This would require a separate Map driverId->socketId; for brevity, we rely on matching.js driverCache which includes socketId.
    const { driverCache } = require('../services/matching');
    const entry = driverCache.get(driverId);
    return entry ? entry.socketId : null;
}
