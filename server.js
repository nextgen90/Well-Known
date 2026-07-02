const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const { initDatabase, pool } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// EJS setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Request parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Flash messages via query parameters
app.use((req, res, next) => {
    res.locals.success = req.query.success || null;
    res.locals.error = req.query.error || null;
    next();
});

// Mount Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const accountRoutes = require('./routes/accounts');
const transactionRoutes = require('./routes/transactions');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', accountRoutes);
app.use('/', transactionRoutes);
app.use('/', profileRoutes);
app.use('/', adminRoutes);

// Root redirect
app.get('/', (req, res) => res.redirect('/login'));

// 404 Handler
app.use((req, res) => {
    res.status(404).render('auth/login', { error: 'Page not found. Redirected to Secure Sign In.' });
});

function startAutoSimulation() {
    setInterval(async () => {
        try {
            // Find all approved bank accounts where auto_run = 1
            const [runningAccounts] = await pool.query("SELECT * FROM bank_accounts WHERE status = 'approved' AND auto_run = 1");
            
            for (const account of runningAccounts) {
                // Generate 15 new transactions in one run (spaced out by 330ms over 5 seconds)
                const timeNow = new Date();
                for (let i = 0; i < 15; i++) {
                    const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [account.user_id]);
                    const user = userRows[0];
                    if (!user || user.status === 'blocked') continue;

                    // Randomly decide credit or debit (70% credit, 30% debit)
                    const isCredit = Math.random() < 0.7;
                    // Random manual-looking amounts (e.g. 1000 - 15000)
                    const amount = Math.floor(Math.random() * (15000 - 1000 + 1)) + 1000;
                    
                    if (!isCredit && user.balance < amount) {
                        continue;
                    }

                    // Staggered created_at timestamps (330ms = 3 per second)
                    const createdTime = new Date(timeNow.getTime() - (i * 330));

                    await pool.query("UPDATE users SET balance = balance + ? WHERE id = ?", [isCredit ? amount : -amount, user.id]);
                    await pool.query(`
                        INSERT INTO transactions (user_id, account_id, type, amount, status, remarks, created_at, processed_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [user.id, account.id, isCredit ? 'credit' : 'debit', amount, 'Auto', `Auto transaction by ${account.bank_name}`, createdTime.toISOString(), createdTime.toISOString()]);
                    
                    console.log(`Generated auto ${isCredit ? 'credit' : 'debit'} of ₹${amount} for user ${user.full_name}`);
                }
            }
        } catch (err) {
            // fail silently
        }
    }, 5000);
}

// Async Startup
async function startServer() {
    try {
        await initDatabase();
        if (process.env.DISABLE_AUTO_SIM !== 'true') {
            startAutoSimulation();
        }
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`WatchPay server running at http://0.0.0.0:${PORT}`);
        });
    } catch (err) {
        console.error('Server failed to start:', err);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { app, initDatabase };
