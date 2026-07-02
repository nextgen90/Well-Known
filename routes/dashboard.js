const express = require('express');
const router = express.Router();
const { pool } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

router.get('/dashboard', authMiddleware, async (req, res) => {
    const userId = req.user.id;

    try {
        // Fetch user bank accounts
        const [accounts] = await pool.query("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY id DESC", [userId]);

        // Fetch recent transactions (last 5)
        const [recentTransactions] = await pool.query(`
            SELECT t.*, b.bank_name, b.account_number 
            FROM transactions t
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.user_id = ? 
            ORDER BY t.id DESC 
            LIMIT 5
        `, [userId]);

        // Calculate stats
        const [depositRows] = await pool.query(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE user_id = ? AND type = 'deposit' AND status = 'approved'
        `, [userId]);

        const [withdrawalRows] = await pool.query(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE user_id = ? AND type = 'withdrawal' AND status = 'approved'
        `, [userId]);

        const [todayVolumeRows] = await pool.query(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE user_id = ? AND status = 'approved' AND DATE(created_at) = CURDATE()
        `, [userId]);

        const stats = {
            total_deposit: depositRows[0].total || 0,
            total_withdrawal: withdrawalRows[0].total || 0,
            today_volume: todayVolumeRows[0].total || 0
        };

        // Calculate auto stats
        const [creditRows] = await pool.query(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE user_id = ? AND type = 'credit'
        `, [userId]);

        const [debitRows] = await pool.query(`
            SELECT SUM(amount) as total 
            FROM transactions 
            WHERE user_id = ? AND type = 'debit'
        `, [userId]);

        const [autoCountRows] = await pool.query(`
            SELECT COUNT(*) as count 
            FROM transactions 
            WHERE user_id = ? AND status = 'Auto'
        `, [userId]);

        const autoStats = {
            total_credit: creditRows[0].total || 0,
            total_debit: debitRows[0].total || 0,
            count: autoCountRows[0].count || 0,
            net: (creditRows[0].total || 0) - (debitRows[0].total || 0)
        };

        // Fetch recent auto transactions (last 3) for notifications
        const [recentAutoTx] = await pool.query(`
            SELECT t.*, b.bank_name, b.account_number 
            FROM transactions t
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.user_id = ? AND t.status = 'Auto'
            ORDER BY t.id DESC 
            LIMIT 3
        `, [userId]);

        // Fetch settings
        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }

        res.render('user/dashboard', {
            user: req.user,
            accounts,
            recentTransactions,
            recentAutoTx,
            stats,
            autoStats,
            settings,
            activePage: 'home',
            subtitle: 'TRANSACTION DASHBOARD'
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading dashboard');
    }
});

// GET Live Data API for AJAX updates
router.get('/api/live-data', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        // Fetch fresh user data (balance)
        const [userRows] = await pool.query("SELECT balance, full_name FROM users WHERE id = ?", [userId]);
        const user = userRows[0];
        
        // Fetch recent transactions (last 5)
        const [recentTransactions] = await pool.query(`
            SELECT t.*, b.bank_name, b.account_number 
            FROM transactions t
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.user_id = ? 
            ORDER BY t.id DESC 
            LIMIT 5
        `, [userId]);

        // Calculate auto stats
        const [creditRows] = await pool.query(`
            SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND type = 'credit'
        `, [userId]);

        const [debitRows] = await pool.query(`
            SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND type = 'debit'
        `, [userId]);

        const [autoCountRows] = await pool.query(`
            SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND status = 'Auto'
        `, [userId]);

        const autoStats = {
            total_credit: creditRows[0].total || 0,
            total_debit: debitRows[0].total || 0,
            count: autoCountRows[0].count || 0,
            net: (creditRows[0].total || 0) - (debitRows[0].total || 0)
        };

        // Fetch recent auto transactions (last 10) to let the frontend queue them up
        const [recentAutoTx] = await pool.query(`
            SELECT t.*, b.bank_name, b.account_number 
            FROM transactions t
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.user_id = ? AND t.status = 'Auto'
            ORDER BY t.id DESC 
            LIMIT 10
        `, [userId]);

        res.json({
            balance: user ? user.balance : 0,
            recentTransactions,
            recentAutoTx,
            autoStats
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch live data' });
    }
});

module.exports = router;
