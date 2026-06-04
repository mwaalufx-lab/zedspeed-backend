const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // Validate promo code
    router.post('/validate', auth, async (req, res) => {
        const { code } = req.body;
        // Simple hardcoded promo for demo – replace with DB lookup
        if (code === 'SAVE10') {
            return res.json({ valid: true, discount: 10, type: 'percent' });
        } else if (code === 'FIVERIDE') {
            return res.json({ valid: true, discount: 5, type: 'fixed' });
        } else {
            return res.status(400).json({ valid: false, message: 'Invalid promo code' });
        }
    });

    return router;
};
