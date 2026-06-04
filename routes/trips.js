const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // ========== NEW: REQUEST RIDE ==========
    router.post('/request', auth, async (req, res) => {
        const { pickup_address, destination_address, pickup_lat, pickup_lng, dest_lat, dest_lng, fare, note, booked_for_name, booked_for_phone, additional_stops } = req.body;
        const result = await db.query(
            `INSERT INTO trips (passenger_id, pickup_address, destination_address, pickup_lat, pickup_lng, dest_lat, dest_lng, fare, status, passenger_note, booked_for_name, booked_for_phone, additional_stops)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
             RETURNING *`,
            [req.user.id, pickup_address, destination_address, pickup_lat, pickup_lng, dest_lat, dest_lng, fare, note, booked_for_name, booked_for_phone, JSON.stringify(additional_stops || [])]
        );
        // Emit via socket.io to nearby drivers
        const io = req.app.get('io');
        if (io) io.emit('new_ride_request', result.rows[0]);
        res.json(result.rows[0]);
    });

    // ========== NEW: ACCEPT RIDE (driver) ==========
    router.post('/accept', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Only drivers can accept rides' });
        const { rideId } = req.body;
        const result = await db.query(
            `UPDATE trips SET driver_id = $1, status = 'accepted' WHERE id = $2 AND status = 'pending' RETURNING *`,
            [req.user.id, rideId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Ride not found or already accepted' });
        const io = req.app.get('io');
        if (io) io.to(`passenger_${result.rows[0].passenger_id}`).emit('ride_accepted', result.rows[0]);
        res.json(result.rows[0]);
    });

    // ========== NEW: START RIDE ==========
    router.post('/start', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Only drivers can start rides' });
        const { tripId } = req.body;
        const result = await db.query(
            `UPDATE trips SET status = 'ongoing', started_at = NOW() WHERE id = $1 AND driver_id = $2 RETURNING *`,
            [tripId, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
        const io = req.app.get('io');
        if (io) io.to(`passenger_${result.rows[0].passenger_id}`).emit('ride_started', result.rows[0]);
        res.json(result.rows[0]);
    });

    // ========== NEW: END RIDE ==========
    router.post('/end', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Only drivers can end rides' });
        const { tripId, fare } = req.body;
        const result = await db.query(
            `UPDATE trips SET status = 'completed', completed_at = NOW(), fare = $1 WHERE id = $2 AND driver_id = $3 RETURNING *`,
            [fare, tripId, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
        const io = req.app.get('io');
        if (io) io.to(`passenger_${result.rows[0].passenger_id}`).emit('ride_ended', result.rows[0]);
        res.json(result.rows[0]);
    });

    // ========== NEW: CANCEL RIDE ==========
    router.post('/cancel', auth, async (req, res) => {
        const { tripId, reason } = req.body;
        const trip = await db.query('SELECT * FROM trips WHERE id = $1', [tripId]);
        if (trip.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
        if (trip.rows[0].passenger_id !== req.user.id && trip.rows[0].driver_id !== req.user.id) {
            return res.status(403).json({ error: 'Not your trip' });
        }
        const result = await db.query(
            `UPDATE trips SET status = 'cancelled', cancellation_reason = $1 WHERE id = $2 RETURNING *`,
            [reason, tripId]
        );
        const io = req.app.get('io');
        if (io) {
            io.to(`passenger_${trip.rows[0].passenger_id}`).emit('ride_cancelled', result.rows[0]);
            if (trip.rows[0].driver_id) io.to(`driver_${trip.rows[0].driver_id}`).emit('ride_cancelled', result.rows[0]);
        }
        res.json(result.rows[0]);
    });

    // ========== EXISTING: Passenger trip history (unify) ==========
    router.get('/history', auth, async (req, res) => {
        let query, params;
        if (req.user.role === 'passenger') {
            query = `SELECT t.*, u.name as driver_name, d.vehicle_plate
                     FROM trips t
                     LEFT JOIN drivers d ON t.driver_id = d.user_id
                     LEFT JOIN users u ON d.user_id = u.id
                     WHERE t.passenger_id = $1
                     ORDER BY t.created_at DESC`;
            params = [req.user.id];
        } else if (req.user.role === 'driver') {
            query = `SELECT t.*, u.name as passenger_name
                     FROM trips t
                     JOIN users u ON t.passenger_id = u.id
                     WHERE t.driver_id = $1
                     ORDER BY t.created_at DESC`;
            params = [req.user.id];
        } else {
            return res.status(403).json({ error: 'Invalid role' });
        }
        const result = await db.query(query, params);
        res.json(result.rows);
    });

    // ========== EXISTING: Rate trip (kept as is) ==========
    router.post('/:tripId/rate', auth, async (req, res) => {
        if (req.user.role !== 'passenger') return res.status(403).json({ error: 'Only passengers can rate' });
        const { rating } = req.body;
        if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
        await db.query(
            `UPDATE trips SET rating_passenger = $1 WHERE id = $2 AND passenger_id = $3`,
            [rating, req.params.tripId, req.user.id]
        );
        res.json({ message: 'Rated successfully' });
    });

    return router;
};
