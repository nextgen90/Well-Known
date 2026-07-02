const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/init');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// GET Admin Login
router.get('/admin/login', (req, res) => {
    res.render('admin/login', { error: req.query.error || null });
});

// POST Admin Login
router.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('admin/login', { error: 'Please enter all credentials' });
    }

    try {
        const [rows] = await pool.query("SELECT * FROM users WHERE mobile = ? AND role = 'admin'", [username]);
        const user = rows[0];
        
        if (!user) {
            return res.render('admin/login', { error: 'Invalid admin credentials' });
        }

        const passMatch = bcrypt.compareSync(password, user.password_hash);
        if (!passMatch) {
            return res.render('admin/login', { error: 'Invalid admin credentials' });
        }

        // Update last login
        await pool.query("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

        const token = jwt.sign({ id: user.id, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
        res.cookie('watchpay_token', token, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        });

        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error(err);
        res.render('admin/login', { error: 'Server error' });
    }
});

// Apply admin protection to all routes below
router.use('/admin', authMiddleware, adminMiddleware);

// GET Admin Dashboard
router.get('/admin/dashboard', async (req, res) => {
    try {
        const [userCountRows] = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const [depositSumRows] = await pool.query("SELECT SUM(amount) as sum FROM transactions WHERE type = 'deposit' AND status = 'approved'");
        const [withdrawalSumRows] = await pool.query("SELECT SUM(amount) as sum FROM transactions WHERE type = 'withdrawal' AND status = 'approved'");
        const [pendingTransRows] = await pool.query("SELECT COUNT(*) as count FROM transactions WHERE status = 'pending'");
        const [pendingAccRows] = await pool.query("SELECT COUNT(*) as count FROM bank_accounts WHERE status = 'pending'");
        const [todayVolumeRows] = await pool.query("SELECT SUM(amount) as sum FROM transactions WHERE status = 'approved' AND DATE(created_at) = CURDATE()");

        const stats = {
            totalUsers: userCountRows[0].count || 0,
            totalDeposits: depositSumRows[0].sum || 0,
            totalWithdrawals: withdrawalSumRows[0].sum || 0,
            pendingRequests: (pendingTransRows[0].count || 0) + (pendingAccRows[0].count || 0),
            todayVolume: todayVolumeRows[0].sum || 0
        };

        const [recentTransactions] = await pool.query(`
            SELECT t.*, u.full_name, u.mobile 
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            ORDER BY t.id DESC
            LIMIT 10
        `);

        res.render('admin/dashboard', {
            user: req.user,
            stats,
            recentTransactions,
            activePage: 'dashboard'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Admin dashboard error');
    }
});

// GET Admin Users list
router.get('/admin/users', async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT u.*, (SELECT auto_run FROM bank_accounts WHERE user_id = u.id ORDER BY id DESC LIMIT 1) as auto_run 
            FROM users u 
            WHERE u.role = 'user' 
            ORDER BY u.id DESC
        `);
        res.render('admin/users', {
            user: req.user,
            users,
            activePage: 'users'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading users');
    }
});

// POST Toggle Auto Run for User from Users List
router.post('/admin/users/:id/toggle-auto', async (req, res) => {
    const userId = req.params.id;
    try {
        const [accounts] = await pool.query("SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY id DESC LIMIT 1", [userId]);
        let account = accounts[0];
        
        if (!account) {
            // Seed a mock approved account for the user so auto-simulation works instantly!
            const [result] = await pool.query(`
                INSERT INTO bank_accounts (user_id, account_type, bank_name, holder_name, account_number, ifsc_code, status, min_deposit, auto_run)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [userId, 'Saving Account', 'INDUSIND BANK', 'Sumit Kumar', '294692151479', 'INDB0002946', 'approved', 5000, 1]);
            
            // Generate initial transactions to populate lists instantly
            const timeNow = new Date();
            for (let i = 0; i < 5; i++) {
                const isCredit = Math.random() < 0.7;
                const amt = Math.floor(Math.random() * (15000 - 1000 + 1)) + 1000;
                const createdTime = new Date(timeNow.getTime() - (i * 2000));
                
                await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [isCredit ? amt : -amt, userId]);
                await pool.query(`
                    INSERT INTO transactions (user_id, account_id, type, amount, status, remarks, created_at, processed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [userId, result.insertId, isCredit ? 'credit' : 'debit', amt, 'Auto', 'Auto transaction by INDUSIND BANK', createdTime.toISOString(), createdTime.toISOString()]);
            }
        } else {
            const newRunState = account.auto_run === 1 ? 0 : 1;
            // Toggle auto_run and ensure approved
            await pool.query("UPDATE bank_accounts SET auto_run = ?, status = 'approved' WHERE id = ?", [newRunState, account.id]);
        }
        
        res.redirect('/admin/users?success=Auto transaction simulator status updated');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/users?error=Error toggling auto run');
    }
});

// POST Toggle user status (active/blocked)
router.post('/admin/users/:id/toggle', async (req, res) => {
    const userId = req.params.id;
    try {
        const [rows] = await pool.query("SELECT status FROM users WHERE id = ?", [userId]);
        const user = rows[0];
        if (user) {
            const newStatus = user.status === 'active' ? 'blocked' : 'active';
            await pool.query("UPDATE users SET status = ? WHERE id = ?", [newStatus, userId]);
        }
        res.redirect('/admin/users?success=User status updated');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/users?error=Error updating status');
    }
});

// POST Delete user
router.post('/admin/users/:id/delete', async (req, res) => {
    const userId = req.params.id;
    try {
        // Cascade delete will handle accounts & transactions due to table setup
        await pool.query("DELETE FROM users WHERE id = ?", [userId]);
        res.redirect('/admin/users?success=User deleted successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/users?error=Error deleting user');
    }
});

// POST Edit user balance
router.post('/admin/users/:id/edit-balance', async (req, res) => {
    const userId = req.params.id;
    const { balance } = req.body;
    try {
        const parsedBalance = parseFloat(balance);
        if (isNaN(parsedBalance) || parsedBalance < 0) {
            return res.redirect('/admin/users?error=Invalid balance amount');
        }
        await pool.query("UPDATE users SET balance = ? WHERE id = ?", [parsedBalance, userId]);
        res.redirect('/admin/users?success=User balance updated successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/users?error=Error updating user balance');
    }
});

// GET Admin Bank Account Approvals
router.get('/admin/accounts', async (req, res) => {
    const { status } = req.query;
    try {
        let query = `
            SELECT b.*, u.full_name, u.mobile 
            FROM bank_accounts b
            JOIN users u ON b.user_id = u.id
        `;
        const params = [];

        if (status && status !== 'All') {
            query += " WHERE b.status = ?";
            params.push(status.toLowerCase());
        }

        query += " ORDER BY b.id DESC";

        const [accounts] = await pool.query(query, params);

        res.render('admin/accounts', {
            user: req.user,
            accounts,
            selectedStatus: status || 'All',
            activePage: 'accounts'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading bank accounts');
    }
});

// POST Approve Account
router.post('/admin/accounts/:id/approve', async (req, res) => {
    const accId = req.params.id;
    try {
        await pool.query("UPDATE bank_accounts SET status = 'approved' WHERE id = ?", [accId]);
        
        // Find associated pending deposit transaction
        const [txs] = await pool.query("SELECT * FROM transactions WHERE account_id = ? AND type = 'deposit' AND status = 'pending' LIMIT 1", [accId]);
        const tx = txs[0];
        
        if (tx) {
            await pool.query("UPDATE transactions SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [tx.id]);
            await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [tx.amount, tx.user_id]);
        }
        
        res.redirect('/admin/accounts?success=Account approved and registration deposit fee credited');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/accounts?error=Error approving account');
    }
});

// POST Reject Account
router.post('/admin/accounts/:id/reject', async (req, res) => {
    const accId = req.params.id;
    try {
        await pool.query("UPDATE bank_accounts SET status = 'rejected' WHERE id = ?", [accId]);
        res.redirect('/admin/accounts?success=Account rejected successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/accounts?error=Error rejecting account');
    }
});

// POST Toggle Auto Run for Admin
router.post('/admin/accounts/:id/toggle-run', async (req, res) => {
    const accId = req.params.id;
    try {
        const [rows] = await pool.query("SELECT * FROM bank_accounts WHERE id = ?", [accId]);
        const account = rows[0];
        if (account && account.status === 'approved') {
            const newRunState = account.auto_run === 1 ? 0 : 1;
            await pool.query("UPDATE bank_accounts SET auto_run = ? WHERE id = ?", [newRunState, accId]);
            res.redirect('/admin/accounts?success=Account auto run toggled');
        } else {
            res.redirect('/admin/accounts?error=Account must be approved first');
        }
    } catch (err) {
        console.error(err);
        res.redirect('/admin/accounts?error=Error toggling run state');
    }
});

// GET Deposits list
router.get('/admin/deposits', async (req, res) => {
    const { status } = req.query;
    try {
        let query = `
            SELECT t.*, u.full_name, u.mobile, b.bank_name, b.account_number 
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.type = 'deposit'
        `;
        const params = [];

        if (status && status !== 'All') {
            query += " AND t.status = ?";
            params.push(status.toLowerCase());
        }

        query += " ORDER BY t.id DESC";

        const [deposits] = await pool.query(query, params);

        res.render('admin/deposits', {
            user: req.user,
            deposits,
            selectedStatus: status || 'All',
            activePage: 'deposits'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading deposits');
    }
});

// POST Approve Deposit
router.post('/admin/deposits/:id/approve', async (req, res) => {
    const txId = req.params.id;
    try {
        const [rows] = await pool.query("SELECT * FROM transactions WHERE id = ? AND type = 'deposit'", [txId]);
        const tx = rows[0];
        if (!tx || tx.status !== 'pending') {
            return res.redirect('/admin/deposits?error=Deposit not pending or not found');
        }

        // Run updates
        await pool.query("UPDATE transactions SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [txId]);
        await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [tx.amount, tx.user_id]);

        res.redirect('/admin/deposits?success=Deposit approved and balance credited');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/deposits?error=Error approving deposit');
    }
});

// POST Reject Deposit
router.post('/admin/deposits/:id/reject', async (req, res) => {
    const txId = req.params.id;
    try {
        await pool.query("UPDATE transactions SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [txId]);
        res.redirect('/admin/deposits?success=Deposit request rejected');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/deposits?error=Error rejecting deposit');
    }
});

// GET Withdrawals list
router.get('/admin/withdrawals', async (req, res) => {
    const { status } = req.query;
    try {
        let query = `
            SELECT t.*, u.full_name, u.mobile, b.bank_name, b.account_number 
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN bank_accounts b ON t.account_id = b.id
            WHERE t.type = 'withdrawal'
        `;
        const params = [];

        if (status && status !== 'All') {
            query += " AND t.status = ?";
            params.push(status.toLowerCase());
        }

        query += " ORDER BY t.id DESC";

        const [withdrawals] = await pool.query(query, params);

        res.render('admin/withdrawals', {
            user: req.user,
            withdrawals,
            selectedStatus: status || 'All',
            activePage: 'withdrawals'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading withdrawals');
    }
});

// POST Approve Withdrawal
router.post('/admin/withdrawals/:id/approve', async (req, res) => {
    const txId = req.params.id;
    try {
        await pool.query("UPDATE transactions SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [txId]);
        res.redirect('/admin/withdrawals?success=Withdrawal approved successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/withdrawals?error=Error approving withdrawal');
    }
});

// POST Reject Withdrawal
router.post('/admin/withdrawals/:id/reject', async (req, res) => {
    const txId = req.params.id;
    try {
        const [rows] = await pool.query("SELECT * FROM transactions WHERE id = ? AND type = 'withdrawal'", [txId]);
        const tx = rows[0];
        if (!tx || tx.status !== 'pending') {
            return res.redirect('/admin/withdrawals?error=Withdrawal not pending or not found');
        }

        // Refund held balance
        await pool.query("UPDATE transactions SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = ?", [txId]);
        await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [tx.amount, tx.user_id]);

        res.redirect('/admin/withdrawals?success=Withdrawal rejected and balance refunded');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/withdrawals?error=Error rejecting withdrawal');
    }
});

// GET All Transactions log
router.get('/admin/transactions', async (req, res) => {
    const { type, status } = req.query;
    try {
        let query = `
            SELECT t.*, u.full_name, u.mobile 
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (type && type !== 'All') {
            query += " AND t.type = ?";
            params.push(type.toLowerCase());
        }

        if (status && status !== 'All') {
            query += " AND t.status = ?";
            params.push(status.toLowerCase());
        }

        query += " ORDER BY t.id DESC";

        const [transactions] = await pool.query(query, params);

        res.render('admin/transactions', {
            user: req.user,
            transactions,
            selectedType: type || 'All',
            selectedStatus: status || 'All',
            activePage: 'transactions'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading transaction history');
    }
});

// GET Settings
router.get('/admin/settings', async (req, res) => {
    try {
        const [settingsRows] = await pool.query("SELECT \`key\`, value FROM settings");
        const settings = {};
        for (const row of settingsRows) {
            settings[row.key] = row.value;
        }

        res.render('admin/settings', {
            user: req.user,
            settings,
            activePage: 'settings'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading settings');
    }
});

// POST Save Settings
router.post('/admin/settings', async (req, res) => {
    const { commission_rate, min_withdrawal, banner_text, saving_min, current_min, corporate_min, admin_upi } = req.body;
    
    try {
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('commission_rate', ?) ON DUPLICATE KEY UPDATE value = ?", [commission_rate, commission_rate]);
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('min_withdrawal', ?) ON DUPLICATE KEY UPDATE value = ?", [min_withdrawal, min_withdrawal]);
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('banner_text', ?) ON DUPLICATE KEY UPDATE value = ?", [banner_text, banner_text]);
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('saving_min', ?) ON DUPLICATE KEY UPDATE value = ?", [saving_min, saving_min]);
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('current_min', ?) ON DUPLICATE KEY UPDATE value = ?", [current_min, current_min]);
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('corporate_min', ?) ON DUPLICATE KEY UPDATE value = ?", [corporate_min, corporate_min]);
        await pool.query("INSERT INTO settings (\`key\`, value) VALUES ('admin_upi', ?) ON DUPLICATE KEY UPDATE value = ?", [admin_upi || 'watchpay@axl', admin_upi || 'watchpay@axl']);

        res.redirect('/admin/settings?success=Settings updated successfully');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/settings?error=Error saving settings');
    }
});

module.exports = router;
