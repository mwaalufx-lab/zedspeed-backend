const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // Get subscription status
    router.get('/', auth, async (req, res) => {
        const result = await db.query(
            `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.json({ active: false });
        }
        res.json({
            active: result.rows[0].status === 'active',
            plan: result.rows[0].plan,
            expires_at: result.rows[0].expires_at
        });
    });

    // Create subscription (mock payment)
    router.post('/create', auth, async (req, res) => {
        const { planId, paymentMethod } = req.body;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days
        await db.query(
            `INSERT INTO subscriptions (user_id, plan, status, expires_at, payment_method)
             VALUES ($1, $2, 'active', $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
             plan = $2, status = 'active', expires_at = $3, payment_method = $4`,
            [req.user.id, planId, expiresAt, paymentMethod]
        );
        res.json({ message: 'Subscription activated', expires_at: expiresAt });
    });

    // Cancel subscription
    router.post('/cancel', auth, async (req, res) => {
        await db.query(
            `UPDATE subscriptions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
            [req.user.id]
        );
        res.json({ message: 'Subscription cancelled' });
    });

    return router;
};
