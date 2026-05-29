// Simple in-memory cache – replace with Redis later
class LocationCache {
    constructor() {
        this.store = new Map();
    }
    set(key, value, ttlSeconds = 10) {
        this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }
    delete(key) {
        this.store.delete(key);
    }
}
module.exports = new LocationCache();
