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

    // ========== LIVE TRIPS ENDPOINT ==========
    router.get('/trips/live', auth, adminOnly, async (req, res) => {
        try {
            const result = await db.query(`
                SELECT t.*, 
                       u.name as passenger_name, u.phone as passenger_phone,
                       du.name as driver_name, dv.vehicle_plate,
                       t.pickup_lat, t.pickup_lng, t.dest_lat, t.dest_lng
                FROM trips t
                JOIN users u ON t.passenger_id = u.id
                LEFT JOIN drivers d ON t.driver_id = d.user_id
                LEFT JOIN users du ON d.user_id = du.id
                LEFT JOIN drivers dv ON d.user_id = dv.user_id
                WHERE t.status IN ('pending', 'accepted', 'ongoing')
                ORDER BY t.created_at DESC
            `);
            res.json(result.rows);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch live trips' });
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
