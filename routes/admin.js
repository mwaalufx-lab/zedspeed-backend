const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // Admin middleware
    const adminOnly = (req, res, next) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        next();
    };

    // Get all pending drivers
    router.get('/drivers/pending', auth, adminOnly, async (req, res) => {
        const result = await db.query(
            `SELECT d.*, u.name, u.phone
             FROM drivers d
             JOIN users u ON d.user_id = u.id
             WHERE d.status = 'pending'`
        );
        res.json(result.rows);
    });

    // Approve driver
    router.put('/drivers/:userId/approve', auth, adminOnly, async (req, res) => {
        await db.query(`UPDATE drivers SET status = 'approved' WHERE user_id = $1`, [req.params.userId]);
        res.json({ message: 'Driver approved' });
    });

    // Activate driver (after subscription)
    router.put('/drivers/:userId/activate', auth, adminOnly, async (req, res) => {
        await db.query(`UPDATE drivers SET status = 'active' WHERE user_id = $1`, [req.params.userId]);
        res.json({ message: 'Driver activated' });
    });

    // Suspend driver
    router.put('/drivers/:userId/suspend', auth, adminOnly, async (req, res) => {
        await db.query(`UPDATE drivers SET status = 'suspended' WHERE user_id = $1`, [req.params.userId]);
        res.json({ message: 'Driver suspended' });
    });

    // Get all trips (admin view)
    router.get('/trips', auth, adminOnly, async (req, res) => {
        const result = await db.query(
            `SELECT t.*, pu.name as passenger_name, du.name as driver_name
             FROM trips t
             JOIN users pu ON t.passenger_id = pu.id
             LEFT JOIN drivers d ON t.driver_id = d.user_id
             LEFT JOIN users du ON d.user_id = du.id
             ORDER BY t.created_at DESC`
        );
        res.json(result.rows);
    });

    // ========== STATS ENDPOINT ==========
    router.get('/stats', auth, adminOnly, async (req, res) => {
        try {
            const [
                totalDrivers,
                onlineDrivers,
                totalPassengers,
                todayTrips,
                todayRevenue,
                pendingDrivers
            ] = await Promise.all([
                db.query('SELECT COUNT(*) FROM drivers'),
                db.query('SELECT COUNT(*) FROM drivers WHERE is_online = true'),
                db.query('SELECT COUNT(*) FROM users WHERE role = $1', ['passenger']),
                db.query(`SELECT COUNT(*) FROM trips WHERE DATE(created_at) = CURRENT_DATE`),
                db.query(`SELECT COALESCE(SUM(fare), 0) FROM trips WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'`),
                db.query(`SELECT COUNT(*) FROM drivers WHERE status = 'pending'`)
            ]);
            res.json({
                totalDrivers: parseInt(totalDrivers.rows[0].count),
                onlineDrivers: parseInt(onlineDrivers.rows[0].count),
                totalPassengers: parseInt(totalPassengers.rows[0].count),
                todayTrips: parseInt(todayTrips.rows[0].count),
                todayRevenue: parseFloat(todayRevenue.rows[0].sum),
                pendingDrivers: parseInt(pendingDrivers.rows[0].count)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    // Get driver full details (for admin review)
    router.get('/drivers/:userId/details', auth, adminOnly, async (req, res) => {
        const { userId } = req.params;
        try {
            const result = await db.query(
                `SELECT u.name, u.phone, u.created_at as user_since,
                        d.nrc, d.nrc_image_url, d.license_number, d.license_image_url,
                        d.vehicle_model, d.vehicle_plate, d.vehicle_color, d.selfie_url,
                        d.status, d.created_at as driver_since
                 FROM drivers d
                 JOIN users u ON d.user_id = u.id
                 WHERE d.user_id = $1`,
                [userId]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Driver not found' });
            }
            res.json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch driver details' });
        }
    });

    // ========== LIVE TRIPS ENDPOINT ==========
    router.get('/trips/live', auth, adminOnly, async (req, res) => {
        try {
            const result = await db.query(`
                SELECT t.id, t.pickup_address, t.destination_address,
                       t.pickup_lat, t.pickup_lng, t.dest_lat, t.dest_lng,
                       t.fare, t.status, t.created_at,
                       u.name as passenger_name, u.phone as passenger_phone,
                       du.name as driver_name, d.vehicle_plate
                FROM trips t
                JOIN users u ON t.passenger_id = u.id
                LEFT JOIN drivers d ON t.driver_id = d.user_id
                LEFT JOIN users du ON d.user_id = du.id
                WHERE t.status IN ('pending', 'accepted', 'ongoing')
                ORDER BY t.created_at DESC
            `);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch live trips' });
        }
    });

    // Admin cancels an ongoing trip (with optional refund)
    router.post('/trips/:tripId/cancel', auth, adminOnly, async (req, res) => {
        const { tripId } = req.params;
        const { reason } = req.body;
        try {
            const result = await db.query(
                `UPDATE trips SET status = 'cancelled_by_admin', cancellation_reason = $1
                 WHERE id = $2 RETURNING *`,
                [reason || 'Cancelled by admin', tripId]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Trip not found' });
            }
            const io = req.app.get('io');
            if (io) {
                io.to(`passenger_${result.rows[0].passenger_id}`).emit('trip_cancelled_by_admin', result.rows[0]);
                if (result.rows[0].driver_id) {
                    io.to(`driver_${result.rows[0].driver_id}`).emit('trip_cancelled_by_admin', result.rows[0]);
                }
            }
            res.json({ message: 'Trip cancelled successfully', trip: result.rows[0] });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to cancel trip' });
        }
    });

    // Get all drivers with filters
    router.get('/drivers', auth, adminOnly, async (req, res) => {
        const { status, search } = req.query;
        let query = `
            SELECT d.*, u.name, u.phone, u.created_at as user_since
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        if (status && status !== 'all') {
            params.push(status);
            query += ` AND d.status = $${params.length}`;
        }
        if (search) {
            params.push(`%${search}%`);
            query += ` AND (u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR d.vehicle_plate ILIKE $${params.length})`;
        }
        query += ` ORDER BY d.created_at DESC`;
        const result = await db.query(query, params);
        res.json(result.rows);
    });

    return router;
};
