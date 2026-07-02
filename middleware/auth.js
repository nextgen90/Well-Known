const jwt = require('jsonwebtoken');
const { pool } = require('../database/init');

const JWT_SECRET = 'watchpay_secret_key_2024';

async function authMiddleware(req, res, next) {
    const token = req.cookies.watchpay_token;
    
    if (!token) {
        return res.redirect('/login');
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [decoded.id]);
        const user = rows[0];
        
        if (!user) {
            res.clearCookie('watchpay_token');
            return res.redirect('/login?error=Session invalid');
        }
        
        if (user.status === 'blocked') {
            res.clearCookie('watchpay_token');
            return res.redirect('/login?error=Your account has been blocked');
        }
        
        req.user = user;
        res.locals.user = user;
        next();
    } catch (err) {
        res.clearCookie('watchpay_token');
        return res.redirect('/login?error=Session expired');
    }
}

async function optionalAuth(req, res, next) {
    const token = req.cookies.watchpay_token;
    if (!token) {
        return next();
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [decoded.id]);
        const user = rows[0];
        if (user && user.status !== 'blocked') {
            req.user = user;
            res.locals.user = user;
        }
    } catch (err) {
        // ignore
    }
    next();
}

module.exports = {
    authMiddleware,
    optionalAuth,
    JWT_SECRET
};
