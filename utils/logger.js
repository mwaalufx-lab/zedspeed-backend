async function logEvent(userId, eventType, payload, direction) {
    // In production, write to DB or file
    console.log(`[${direction.toUpperCase()}] user ${userId} | ${eventType}`, payload);
    // Uncomment to log to database (requires db instance)
    // const db = require('../server').app.locals.db; // careful with circular
    // await db.query(
    //     `INSERT INTO websocket_logs (user_id, event_type, payload, direction)
    //      VALUES ($1, $2, $3, $4)`,
    //     [userId, eventType, payload, direction]
    // );
}
module.exports = { logEvent };
