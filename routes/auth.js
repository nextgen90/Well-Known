const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/init');
const { JWT_SECRET } = require('../middleware/auth');

// GET Login
router.get(['/login', '/login.html'], (req, res) => {
    if (req.cookies.watchpay_token) {
        try {
            const decoded = jwt.verify(req.cookies.watchpay_token, JWT_SECRET);
            if (decoded.role === 'admin') return res.redirect('/admin/dashboard');
            return res.redirect('/dashboard');
        } catch (e) {
            // ignore
        }
    }
    res.render('auth/login', { error: req.query.error || null, success: req.query.success || null });
});

// GET Register
router.get(['/register', '/register.html'], (req, res) => {
    if (req.cookies.watchpay_token) {
        return res.redirect('/dashboard');
    }
    res.render('auth/register', { error: req.query.error || null });
});

// POST Login
router.post(['/login', '/login.html'], async (req, res) => {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
        return res.render('auth/login', { error: 'Please enter both credentials' });
    }

    try {
        const [rows] = await pool.query("SELECT * FROM users WHERE mobile = ?", [mobile]);
        const user = rows[0];
        
        if (!user) {
            return res.render('auth/login', { error: 'Mobile number not registered' });
        }

        // Verify password
        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.render('auth/login', { error: 'Invalid password' });
        }

        // Check if blocked
        if (user.status === 'blocked') {
            return res.render('auth/login', { error: 'Your account is blocked. Contact support.' });
        }

        // Update last login
        await pool.query("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        // Generate token
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        
        res.cookie('watchpay_token', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        if (user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        } else {
            return res.redirect('/dashboard');
        }

    } catch (err) {
        console.error(err);
        return res.render('auth/login', { error: 'Internal server error' });
    }
});

// POST Register
router.post(['/register', '/register.html'], async (req, res) => {
    const { full_name, mobile, password, confirm_password } = req.body;

    if (!full_name || !mobile || !password || !confirm_password) {
        return res.render('auth/register', { error: 'All fields are required' });
    }

    if (password.length < 6) {
        return res.render('auth/register', { error: 'Password must be at least 6 characters long' });
    }

    if (password !== confirm_password) {
        return res.render('auth/register', { error: 'Passwords do not match' });
    }

    try {
        // Check if user already exists
        const [existing] = await pool.query("SELECT id FROM users WHERE mobile = ?", [mobile]);
        if (existing.length > 0) {
            return res.render('auth/register', { error: 'Mobile number already registered' });
        }

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);

        const [result] = await pool.query(`
            INSERT INTO users (full_name, mobile, password_hash, role, balance, status, is_verified)
            VALUES (?, ?, ?, 'user', 0, 'active', 1)
        `, [full_name, mobile, hash]);

        // Sign token and auto login
        const token = jwt.sign({ id: result.insertId, role: 'user' }, JWT_SECRET, { expiresIn: '24h' });
        
        res.cookie('watchpay_token', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        });

        return res.redirect('/dashboard?success=Account created successfully!');

    } catch (err) {
        console.error(err);
        return res.render('auth/register', { error: 'Database error. Please try again.' });
    }
});

// GET Logout
router.get(['/logout', '/logout.html'], (req, res) => {
    res.clearCookie('watchpay_token');
    res.redirect('/login?success=Logged out successfully');
});

module.exports = router;
