const router = require('express').Router();
const jwt = require('jsonwebtoken');

module.exports = (db) => {
    // Simple admin login (you can later make it more secure)
    router.post('/login', async (req, res) => {
        const { username, password } = req.body;

        // Replace with DB check in production
        if (username === 'admin' && password === 'admin123') {
            let result = await db.query('SELECT id FROM users WHERE phone = $1 AND role = $2', ['admin', 'admin']);
            let userId;

            if (result.rows.length === 0) {
                const newUser = await db.query(
                    'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id',
                    ['admin', 'admin']
                );
                userId = newUser.rows[0].id;
            } else {
                userId = result.rows[0].id;
            }

            const token = jwt.sign({ userId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
            res.json({ token });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });

    return router;
};