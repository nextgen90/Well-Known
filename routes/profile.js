const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

// GET Profile
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT COUNT(*) as count FROM bank_accounts WHERE user_id = ?", [req.user.id]);
        const accountCount = rows[0].count || 0;
        
        res.render('user/profile', {
            user: req.user,
            accountCount,
            activePage: 'profile',
            subtitle: 'PROFILE'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading profile');
    }
});

// POST Change Password
router.post('/change-password', authMiddleware, async (req, res) => {
    const { current_password, new_password, confirm_new_password } = req.body;

    if (!current_password || !new_password || !confirm_new_password) {
        return res.redirect('/profile?error=All password fields are required');
    }

    if (new_password.length < 6) {
        return res.redirect('/profile?error=New password must be at least 6 characters');
    }

    if (new_password !== confirm_new_password) {
        return res.redirect('/profile?error=New passwords do not match');
    }

    try {
        const passMatch = bcrypt.compareSync(current_password, req.user.password_hash);
        if (!passMatch) {
            return res.redirect('/profile?error=Incorrect current password');
        }

        const salt = bcrypt.genSaltSync(10);
        const newHash = bcrypt.hashSync(new_password, salt);

        await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);

        res.redirect('/profile?success=Password updated successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/profile?error=Database error updating password');
    }
});

module.exports = router;
