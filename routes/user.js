const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // Get user profile
    router.get('/profile', auth, async (req, res) => {
        const result = await db.query(
            'SELECT id, phone, role, name, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        res.json(result.rows[0] || {});
    });

    // Update user profile (name, etc.)
    router.put('/profile', auth, async (req, res) => {
        const { name } = req.body;
        await db.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
        res.json({ message: 'Profile updated' });
    });

    return router;
};
