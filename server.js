require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/drivers');
const tripRoutes = require('./routes/trips');
const adminRoutes = require('./routes/admin');
const adminAuthRoutes = require('./routes/adminAuth');
const userRoutes = require('./routes/user');
const subscriptionRoutes = require('./routes/subscription');
const promoRoutes = require('./routes/promo');
const wsHandlers = require('./websocket/handlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Make io accessible to routes
app.set('io', io);

const db = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    family: 4,          // Force IPv4
});

app.locals.db = db;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes(db));
app.use('/api/drivers', driverRoutes(db));
app.use('/api/trips', tripRoutes(db));
app.use('/api/admin', adminRoutes(db));
app.use('/api/users', userRoutes(db));
app.use('/api/subscription', subscriptionRoutes(db));
app.use('/api/promo', promoRoutes(db));
app.use('/api/admin/auth', adminAuthRoutes(db));

// WebSocket authentication
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const res = await db.query('SELECT id, role FROM users WHERE id = $1', [decoded.userId]);
        if (res.rows.length === 0) return next(new Error('User not found'));
        socket.user = { id: res.rows[0].id, role: res.rows[0].role };
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

// Track passenger socket IDs
const passengerSockets = new Map();

io.on('connection', (socket) => {
    console.log(`User ${socket.user.id} connected`);
    if (socket.user.role === 'passenger') {
        passengerSockets.set(socket.user.id, socket.id);
        socket.on('disconnect', () => passengerSockets.delete(socket.user.id));
    }
    wsHandlers(socket, io, db, passengerSockets);
});

server.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
