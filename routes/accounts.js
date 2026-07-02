const express = require('express');
const router = express.Router();
const { pool } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

// GET Add Account
router.get('/add-account', authMiddleware, async (req, res) => {
    try {
        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }

        res.render('user/add-account', {
            user: req.user,
            settings,
            activePage: 'add',
            subtitle: 'ADD ACCOUNT'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading page');
    }
});

// POST Add Account
router.post('/add-account', authMiddleware, async (req, res) => {
    const { account_type, bank_name, holder_name, account_number, ifsc_code, branch_address, upi_id } = req.body;

    if (!account_type || !bank_name || !holder_name || !account_number || !ifsc_code) {
        return res.redirect('/add-account?error=All mandatory fields must be filled');
    }

    try {
        // Fetch minimum deposit from settings
        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }

        let minDeposit = 5000;
        if (account_type === 'Saving Account') minDeposit = parseFloat(settings.saving_min || 5000);
        else if (account_type === 'Current Account') minDeposit = parseFloat(settings.current_min || 10000);
        else if (account_type === 'Corporate Account') minDeposit = parseFloat(settings.corporate_min || 15000);

        const [result] = await pool.query(`
            INSERT INTO bank_accounts (user_id, account_type, bank_name, holder_name, account_number, ifsc_code, branch_address, upi_id, status, min_deposit, auto_run)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0)
        `, [req.user.id, account_type, bank_name, holder_name, account_number, ifsc_code, branch_address || '', upi_id || '', minDeposit]);

        // Redirect to payment page instead of dashboard
        res.redirect(`/pay?account_id=${result.insertId}`);
    } catch (err) {
        console.error(err);
        res.redirect('/add-account?error=Database error. Please check values and try again.');
    }
});

// GET Pay page
router.get('/pay', authMiddleware, async (req, res) => {
    const { account_id } = req.query;
    
    if (!account_id) {
        return res.redirect('/dashboard?error=Missing account ID for payment');
    }
    
    try {
        const [rows] = await pool.query("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", [account_id, req.user.id]);
        const account = rows[0];
        
        if (!account) {
            return res.redirect('/dashboard?error=Account not found');
        }
        
        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }
        
        const adminUpi = settings.admin_upi || 'watchpay@axl';
        const amount = account.min_deposit;
        
        // Generate dynamic UPI payload
        const upiString = `upi://pay?pa=${adminUpi}&pn=WatchPay&am=${amount}&cu=INR`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;

        res.render('user/pay', {
            user: req.user,
            account,
            amount,
            adminUpi,
            qrUrl,
            activePage: 'add',
            subtitle: 'PAYMENT'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading payment page');
    }
});

// POST Submit Payment Proof (UTR / Txn ID)
router.post('/pay', authMiddleware, async (req, res) => {
    const { account_id, utr_id, amount } = req.body;
    
    if (!account_id || !utr_id || !amount) {
        return res.redirect(`/pay?account_id=${account_id}&error=All fields are required`);
    }
    
    try {
        const [rows] = await pool.query("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", [account_id, req.user.id]);
        const account = rows[0];
        
        if (!account) {
            return res.redirect('/dashboard?error=Account not found');
        }
        
        // Create a deposit transaction linked to this account
        await pool.query(`
            INSERT INTO transactions (user_id, account_id, type, amount, status, remarks)
            VALUES (?, ?, 'deposit', ?, 'pending', ?)
        `, [req.user.id, account_id, parseFloat(amount), `Verification Fee for ${account.bank_name}. UTR ID: ${utr_id}`]);
        
        res.redirect('/dashboard?success=Payment proof submitted successfully! Admin will verify and activate your account.');
    } catch (err) {
        console.error(err);
        res.redirect(`/pay?account_id=${account_id}&error=Database error. Please try again.`);
    }
});

// POST Toggle Auto Run for User
router.post('/accounts/:id/toggle-run', authMiddleware, async (req, res) => {
    const accId = parseInt(req.params.id);
    try {
        const [rows] = await pool.query("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", [accId, req.user.id]);
        const account = rows[0];
        
        if (!account || account.status !== 'approved') {
            return res.redirect('/dashboard?error=Bank account must be approved to start auto transactions');
        }
        
        const newRunState = account.auto_run === 1 ? 0 : 1;
        await pool.query("UPDATE bank_accounts SET auto_run = ? WHERE id = ?", [newRunState, accId]);
        
        const msg = newRunState === 1 ? 'Auto transactions run started' : 'Auto transactions run stopped';
        res.redirect(`/dashboard?success=${msg}`);
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard?error=Error toggling auto run');
    }
});

module.exports = router;
