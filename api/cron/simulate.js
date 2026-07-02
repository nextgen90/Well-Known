require('dotenv').config();
const { initDatabase, pool } = require('../../database/init');

let initialized = false;

// Vercel Cron Job handler - replaces setInterval auto-simulation
// Runs every 5 minutes (configured in vercel.json)
module.exports = async (req, res) => {
    // Vercel Cron Jobs send a GET request with an Authorization header
    // Verify the request is from Vercel Cron
    const authHeader = req.headers['authorization'];
    if (process.env.VERCEL && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        if (!initialized) {
            await initDatabase();
            initialized = true;
        }

        // Find all approved bank accounts where auto_run = 1
        const [runningAccounts] = await pool.query(
            "SELECT * FROM bank_accounts WHERE status = 'approved' AND auto_run = 1"
        );

        if (!runningAccounts || runningAccounts.length === 0) {
            return res.status(200).json({ message: 'No accounts with auto_run enabled.', generated: 0 });
        }

        let totalGenerated = 0;

        for (const account of runningAccounts) {
            // Generate 15 new transactions per run
            const timeNow = new Date();
            for (let i = 0; i < 15; i++) {
                const [userRows] = await pool.query("SELECT * FROM users WHERE id = ?", [account.user_id]);
                const user = userRows[0];
                if (!user || user.status === 'blocked') continue;

                // 70% credit, 30% debit
                const isCredit = Math.random() < 0.7;
                const amount = Math.floor(Math.random() * (15000 - 1000 + 1)) + 1000;

                if (!isCredit && user.balance < amount) continue;

                // Stagger timestamps slightly (330ms apart)
                const createdTime = new Date(timeNow.getTime() - (i * 330));

                await pool.query(
                    "UPDATE users SET balance = balance + ? WHERE id = ?",
                    [isCredit ? amount : -amount, user.id]
                );
                await pool.query(`
                    INSERT INTO transactions (user_id, account_id, type, amount, status, remarks, created_at, processed_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    user.id,
                    account.id,
                    isCredit ? 'credit' : 'debit',
                    amount,
                    'Auto',
                    `Auto transaction by ${account.bank_name}`,
                    createdTime.toISOString(),
                    createdTime.toISOString()
                ]);

                totalGenerated++;
            }
        }

        console.log(`[Cron] Auto-simulation complete. Generated ${totalGenerated} transactions.`);
        return res.status(200).json({
            message: 'Auto-simulation complete.',
            generated: totalGenerated,
            accounts: runningAccounts.length
        });

    } catch (err) {
        console.error('[Cron] Auto-simulation error:', err);
        return res.status(500).json({ error: 'Simulation failed', details: err.message });
    }
};
