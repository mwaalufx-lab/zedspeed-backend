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

    return router;
};
