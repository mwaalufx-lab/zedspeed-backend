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

    // Update driver details (for verification)
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

    return router;
};
