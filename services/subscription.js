async function isSubscriptionActive(db, driverId) {
    const res = await db.query(
        `SELECT subscription_status, subscription_expires_at
         FROM drivers WHERE user_id = $1`,
        [driverId]
    );
    if (res.rows.length === 0) return false;
    const sub = res.rows[0];
    if (sub.subscription_status !== 'active') return false;
    if (sub.subscription_expires_at && new Date(sub.subscription_expires_at) < new Date()) {
        await db.query(`UPDATE drivers SET subscription_status='expired' WHERE user_id=$1`, [driverId]);
        return false;
    }
    return true;
}

async function activateSubscription(db, driverId, months = 1) {
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + months);
    await db.query(
        `INSERT INTO subscriptions (driver_id, start_date, end_date, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (driver_id, start_date) DO NOTHING`,
        [driverId, start, end]
    );
    await db.query(
        `UPDATE drivers SET subscription_status='active', subscription_expires_at=$1 WHERE user_id=$2`,
        [end, driverId]
    );
}

module.exports = { isSubscriptionActive, activateSubscription };
