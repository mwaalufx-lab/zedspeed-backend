const router = require('express').Router();
const jwt = require('jsonwebtoken');

module.exports = (db) => {
    router.post('/otp/send', async (req, res) => {
        const { phone } = req.body;
        console.log(`OTP for ${phone}: 1234`);
        res.json({ message: 'OTP sent' });
    });

    router.post('/otp/verify', async (req, res) => {
        const { phone, code, role } = req.body;
        if (code !== '1234') return res.status(401).json({ error: 'Invalid OTP' });
        let result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
        let user;
        if (result.rows.length === 0) {
            const newUser = await db.query(
                'INSERT INTO users (phone, role) VALUES ($1, $2) RETURNING id, role',
                [phone, role]
            );
            user = newUser.rows[0];
        } else {
            user = result.rows[0];
        }
        const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET);
        res.json({ token, user: { id: user.id, phone, role: user.role } });
    });

    return router;
};
