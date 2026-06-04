const router = require('express').Router();
const auth = require('../middleware/auth');

module.exports = (db) => {
    // Passenger trip history
    router.get('/passenger', auth, async (req, res) => {
        if (req.user.role !== 'passenger') return res.status(403).json({ error: 'Not a passenger' });
        const result = await db.query(
            `SELECT t.*, u.name as driver_name, d.vehicle_plate
             FROM trips t
             LEFT JOIN drivers d ON t.driver_id = d.user_id
             LEFT JOIN users u ON d.user_id = u.id
             WHERE t.passenger_id = $1
             ORDER BY t.created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    });

    // Driver trip history
    router.get('/driver', auth, async (req, res) => {
        if (req.user.role !== 'driver') return res.status(403).json({ error: 'Not a driver' });
        const result = await db.query(
            `SELECT t.*, u.name as passenger_name
             FROM trips t
             JOIN users u ON t.passenger_id = u.id
             WHERE t.driver_id = $1
             ORDER BY t.created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    });

    // Rate trip (passenger)
    router.post('/:tripId/rate', auth, async (req, res) => {
        if (req.user.role !== 'passenger') return res.status(403).json({ error: 'Only passengers can rate' });
        const { rating } = req.body;
        if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
        await db.query(
            `UPDATE trips SET rating_passenger = $1 WHERE id = $2 AND passenger_id = $3`,
            [rating, req.params.tripId, req.user.id]
        );
        res.json({ message: 'Rated successfully' });
    });

    return router;
};
