const express = require('express');
const router = express.Router();
const { pool } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

// GET Deposit
router.get('/deposit', authMiddleware, async (req, res) => {
    try {
        const [approvedAccounts] = await pool.query("SELECT * FROM bank_accounts WHERE user_id = ? AND status = 'approved'", [req.user.id]);
        res.render('user/deposit', {
            user: req.user,
            accounts: approvedAccounts,
            activePage: 'deposit',
            subtitle: 'DEPOSIT'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading deposit page');
    }
});

// POST Deposit
router.post('/deposit', authMiddleware, async (req, res) => {
    const { account_id, amount } = req.body;

    if (!account_id || !amount || parseFloat(amount) <= 0) {
        return res.redirect('/deposit?error=Invalid account or amount');
    }

    try {
        const [rows] = await pool.query("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", [account_id, req.user.id]);
        const account = rows[0];
        
        if (!account || account.status !== 'approved') {
            return res.redirect('/deposit?error=Selected bank account is not approved');
        }

        await pool.query(`
            INSERT INTO transactions (user_id, account_id, type, amount, status, remarks)
            VALUES (?, ?, 'deposit', ?, 'pending', ?)
        `, [req.user.id, account_id, parseFloat(amount), `Deposit request to ${account.bank_name}`]);

        res.redirect('/dashboard?success=Deposit request submitted. Balance will update upon verification.');
    } catch (err) {
        console.error(err);
        res.redirect('/deposit?error=Error submitting request');
    }
});

// GET Withdraw
router.get('/withdraw', authMiddleware, async (req, res) => {
    try {
        const [approvedAccounts] = await pool.query("SELECT * FROM bank_accounts WHERE user_id = ? AND status = 'approved'", [req.user.id]);
        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }

        res.render('user/withdraw', {
            user: req.user,
            accounts: approvedAccounts,
            settings,
            activePage: 'withdraw',
            subtitle: 'WITHDRAW'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading withdraw page');
    }
});

// POST Withdraw
router.post('/withdraw', authMiddleware, async (req, res) => {
    const { account_id, amount } = req.body;

    if (!account_id || !amount || parseFloat(amount) <= 0) {
        return res.redirect('/withdraw?error=Invalid account or amount');
    }

    try {
        const [rows] = await pool.query("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", [account_id, req.user.id]);
        const account = rows[0];
        
        if (!account || account.status !== 'approved') {
            return res.redirect('/withdraw?error=Selected bank account is not approved');
        }

        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }

        const minWithdraw = parseFloat(settings.min_withdrawal || 2000);
        const withdrawAmt = parseFloat(amount);

        if (withdrawAmt < minWithdraw) {
            return res.redirect(`/withdraw?error=Minimum withdrawal is ₹${minWithdraw}`);
        }

        if (req.user.balance < withdrawAmt) {
            return res.redirect('/withdraw?error=Insufficient balance');
        }

        // Deduct balance immediately to place it on hold
        await pool.query("UPDATE users SET balance = balance - ? WHERE id = ?", [withdrawAmt, req.user.id]);

        await pool.query(`
            INSERT INTO transactions (user_id, account_id, type, amount, status, remarks)
            VALUES (?, ?, 'withdrawal', ?, 'pending', ?)
        `, [req.user.id, account_id, withdrawAmt, `Withdrawal request to ${account.bank_name}`]);

        res.redirect('/dashboard?success=Withdrawal request submitted. Amount is on hold.');
    } catch (err) {
        console.error(err);
        res.redirect('/withdraw?error=Error submitting request');
    }
});

// GET History
router.get('/history', authMiddleware, async (req, res) => {
    const { type } = req.query;
    try {
        let query = `
            SELECT t.*, b.bank_name, b.account_number 
            FROM transactions t
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.user_id = ?
        `;
        const params = [req.user.id];

        if (type && type !== 'All') {
            query += " AND t.type = ?";
            params.push(type.toLowerCase());
        }

        query += " ORDER BY t.id DESC";

        const [transactions] = await pool.query(query, params);

        res.render('user/history', {
            user: req.user,
            transactions,
            selectedType: type || 'All',
            activePage: 'history',
            subtitle: 'HISTORY'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading history');
    }
});

module.exports = router;
