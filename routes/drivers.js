const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // Get driver profile
    router.get('/profile', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });
        const result = await db.query(
            `SELECT u.name, u.phone, d.* FROM drivers d
             JOIN users u ON d.user_id = u.id
             WHERE d.user_id = $1`,
            [req.user.id]
        );
        res.json(result.rows[0] || {});
    });

    // Update driver details (used for verification)
    router.put('/profile', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });
        const { nrc, nrc_image_url, license_number, license_image_url, vehicle_model, vehicle_plate, vehicle_color, selfie_url } = req.body;
        await db.query(
            `INSERT INTO drivers (user_id, nrc, nrc_image_url, license_number, license_image_url, vehicle_model, vehicle_plate, vehicle_color, selfie_url, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
             ON CONFLICT (user_id) DO UPDATE SET
             nrc=$2, nrc_image_url=$3, license_number=$4, license_image_url=$5,
             vehicle_model=$6, vehicle_plate=$7, vehicle_color=$8, selfie_url=$9, status='pending'`,
            [req.user.id, nrc, nrc_image_url, license_number, license_image_url, vehicle_model, vehicle_plate, vehicle_color, selfie_url]
        );
        res.json({ message: 'Profile updated, pending approval' });
    });

    router.post('/verify', auth, async (req, res) => {
        // Double-check that the user is authenticated
        if (!req.user || !req.user.id) {
            console.error('No user object in request. Auth middleware failed.');
            return res.status(401).json({ error: 'Authentication failed. Please log in again.' });
        }

        if (req.user.role !== 'driver') {
            return res.status(403).json({ error: 'Only drivers can submit verification.' });
        }

        const { nrc, nrc_image_url, license_number, license_image_url, vehicle_model, vehicle_plate, vehicle_color, selfie_url } = req.body;

        // Validate required fields
        if (!vehicle_model || !vehicle_plate || !vehicle_color || !nrc || !license_number) {
            return res.status(400).json({ error: 'Missing required fields: vehicle_model, vehicle_plate, vehicle_color, nrc, license_number' });
        }

        const userId = req.user.id;
        console.log(`Inserting driver verification for user_id: ${userId}`);

        try {
            await db.query(
                `INSERT INTO drivers (user_id, nrc, nrc_image_url, license_number, license_image_url, vehicle_model, vehicle_plate, vehicle_color, selfie_url, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
                 ON CONFLICT (user_id) DO UPDATE SET
                 nrc = EXCLUDED.nrc,
                 nrc_image_url = EXCLUDED.nrc_image_url,
                 license_number = EXCLUDED.license_number,
                 license_image_url = EXCLUDED.license_image_url,
                 vehicle_model = EXCLUDED.vehicle_model,
                 vehicle_plate = EXCLUDED.vehicle_plate,
                 vehicle_color = EXCLUDED.vehicle_color,
                 selfie_url = EXCLUDED.selfie_url,
                 status = 'pending'`,
                [userId, nrc, nrc_image_url, license_number, license_image_url, vehicle_model, vehicle_plate, vehicle_color, selfie_url]
            );
            res.json({ message: 'Verification submitted successfully' });
        } catch (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: 'Database error: ' + err.message });
        }
    });

    // Get verification status
    router.get('/verification-status', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });
        const result = await db.query(
            `SELECT status FROM drivers WHERE user_id = $1`,
            [req.user.id]
        );
        const status = result.rows[0]?.status || 'not_submitted';
        res.json({ status });
    });

    // Toggle online status
    router.post('/toggle-online', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });
        const { online } = req.body;
        await db.query(
            `UPDATE drivers SET is_online = $1 WHERE user_id = $2`,
            [online, req.user.id]
        );
        res.json({ online });
    });

    // Count approved drivers who are currently online
    router.get('/online/count', auth, async (req, res) => {
        try {
            const result = await db.query(
                `SELECT COUNT(*) AS count
                 FROM drivers
                 WHERE is_online = true AND status = 'approved'`
            );
            res.json({ count: parseInt(result.rows[0].count, 10) });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch online drivers count' });
        }
    });

    return router;
};