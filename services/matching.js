// In-memory cache: driverId -> { lat, lng, socketId, online, inTrip }
const driverCache = new Map();

function updateDriverLocation(driverId, lat, lng, socketId, online = true, inTrip = false) {
    driverCache.set(driverId, { lat, lng, socketId, online, inTrip, lastUpdate: Date.now() });
}

function removeDriver(driverId) {
    driverCache.delete(driverId);
}

function getNearbyDrivers(pickupLat, pickupLng, radiusKm = 5) {
    const nearby = [];
    for (const [driverId, data] of driverCache.entries()) {
        if (!data.online || data.inTrip) continue;
        const distance = haversine(pickupLat, pickupLng, data.lat, data.lng);
        if (distance <= radiusKm) {
            nearby.push({ driverId, distance, socketId: data.socketId });
        }
    }
    nearby.sort((a, b) => a.distance - b.distance);
    return nearby.slice(0, 10);
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
function toRad(deg) { return deg * (Math.PI/180); }

function setDriverOnlineStatus(driverId, online) {
    const existing = driverCache.get(driverId);
    if (existing) {
        existing.online = online;
        driverCache.set(driverId, existing);
    }
}

function setDriverInTrip(driverId, inTrip) {
    const existing = driverCache.get(driverId);
    if (existing) {
        existing.inTrip = inTrip;
        driverCache.set(driverId, existing);
    }
}

module.exports = { updateDriverLocation, removeDriver, getNearbyDrivers, setDriverOnlineStatus, setDriverInTrip };
