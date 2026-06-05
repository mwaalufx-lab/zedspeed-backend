const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            console.error('No authorization header');
            return res.status(401).json({ error: 'No token provided' });
        }
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            console.error('Malformed authorization header');
            return res.status(401).json({ error: 'Malformed token' });
        }
        const token = parts[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: decoded.userId, role: decoded.role };
        next();
    } catch (err) {
        console.error('Auth middleware error:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};
