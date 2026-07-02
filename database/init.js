require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

const dbJsonPath = process.env.USE_MOCK_DB_PATH || path.join(os.tmpdir(), 'watchpay_db.json');

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;
const hasDbConfig = Boolean(connectionString || process.env.DB_HOST);
const pgConfig = connectionString ? {
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
} : {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '5432', 10),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'watchpay',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

const realPool = new Pool(pgConfig);

let useMock = process.env.USE_MOCK_DB === 'true';
if (!hasDbConfig && !useMock) {
    console.warn('No PostgreSQL config detected. Falling back to local JSON mock DB.');
    useMock = true;
}

// Mock database reader/writer
function readDB() {
    if (!fs.existsSync(dbJsonPath)) {
        fs.writeFileSync(dbJsonPath, JSON.stringify({ users: [], bank_accounts: [], transactions: [], settings: {} }, null, 2), 'utf8');
    }
    return JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), 'utf8');
}

function convertPlaceholders(sql) {
    let index = 0;
    let result = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];

        if (ch === "'" && !inDouble && !inBacktick) {
            inSingle = !inSingle;
            result += ch;
            continue;
        }
        if (ch === '"' && !inSingle && !inBacktick) {
            inDouble = !inDouble;
            result += ch;
            continue;
        }
        if (ch === '`' && !inSingle && !inDouble) {
            inBacktick = !inBacktick;
            result += '"';
            continue;
        }

        if (ch === '?' && !inSingle && !inDouble && !inBacktick) {
            index += 1;
            result += `$${index}`;
            continue;
        }

        result += ch;
    }

    return result;
}

// Wrapper pool object
const pool = {
    async query(sql, params = []) {
        if (!useMock) {
            try {
                const convertedSql = convertPlaceholders(sql);
                const normalizedSql = convertedSql.trim();
                const returnId = /^INSERT\s+INTO\s+(users|bank_accounts|transactions)\s+/i.test(normalizedSql) && !/RETURNING\s+/i.test(normalizedSql);
                const finalSql = returnId ? `${normalizedSql} RETURNING id` : normalizedSql;
                const result = await realPool.query(finalSql, params);

                if (result.command === 'INSERT' && result.rows && result.rows[0]) {
                    return [{ insertId: result.rows[0].id || null, affectedRows: result.rowCount }, result.fields || []];
                }

                return [result.rows || [], result.fields || []];
            } catch (err) {
                throw err;
            }
        }

        // Mock JSON Database Interpreter
        const data = readDB();
        const sqlClean = sql.trim().replace(/\s+/g, ' ');

        // SELECT * FROM users WHERE mobile = ?
        if (sqlClean.includes('SELECT * FROM users WHERE mobile = ?')) {
            const user = data.users.find(u => u.mobile === params[0]);
            return [user ? [user] : []];
        }
        
        // SELECT * FROM users WHERE id = ?
        if (sqlClean.includes('SELECT * FROM users WHERE id = ?')) {
            const user = data.users.find(u => u.id === parseInt(params[0]));
            return [user ? [user] : []];
        }

        // SELECT COUNT(*) as count FROM bank_accounts WHERE user_id = ?
        if (sqlClean.includes('SELECT COUNT(*) as count FROM bank_accounts')) {
            const count = data.bank_accounts.filter(a => a.user_id === parseInt(params[0])).length;
            return [[{ count }]];
        }

        // SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY id DESC
        if (sqlClean.includes('SELECT * FROM bank_accounts WHERE user_id = ? ORDER BY id DESC')) {
            const accs = data.bank_accounts.filter(a => a.user_id === parseInt(params[0]));
            accs.sort((a, b) => b.id - a.id);
            return [accs];
        }

        // SELECT t.*, b.bank_name, b.account_number FROM transactions t LEFT JOIN bank_accounts ...
        if (sqlClean.includes('FROM transactions t LEFT JOIN bank_accounts b')) {
            const userId = parseInt(params[0]);
            let txs = data.transactions.filter(t => t.user_id === userId);
            
            // Apply status filter if type parameters are present (from history query)
            const typeParam = params[1];
            if (typeParam) {
                txs = txs.filter(t => t.type === typeParam.toLowerCase());
            }

            // Map joined fields
            txs = txs.map(t => {
                const acc = data.bank_accounts.find(a => a.id === t.account_id);
                return {
                    ...t,
                    bank_name: acc ? acc.bank_name : null,
                    account_number: acc ? acc.account_number : null
                };
            });

            txs.sort((a, b) => b.id - a.id);

            // Limit if needed
            if (sqlClean.includes('LIMIT 5')) {
                txs = txs.slice(0, 5);
            } else if (sqlClean.includes('LIMIT 3')) {
                txs = txs.slice(0, 3);
            }
            return [txs];
        }

        // SUM stats
        if (sqlClean.includes('SELECT SUM(amount) as total FROM transactions')) {
            const userId = parseInt(params[0]);
            let txs = data.transactions.filter(t => t.user_id === userId);
            
            if (sqlClean.includes("type = 'deposit'") && sqlClean.includes("status = 'approved'")) {
                txs = txs.filter(t => t.type === 'deposit' && t.status === 'approved');
            } else if (sqlClean.includes("type = 'withdrawal'") && sqlClean.includes("status = 'approved'")) {
                txs = txs.filter(t => t.type === 'withdrawal' && t.status === 'approved');
            } else if (sqlClean.includes("status = 'approved' AND DATE(created_at) = CURDATE()") || sqlClean.includes("status = 'approved' AND DATE(created_at) = DATE('now', 'localtime')")) {
                txs = txs.filter(t => t.status === 'approved' && new Date(t.created_at).toDateString() === new Date().toDateString());
            } else if (sqlClean.includes("type = 'credit'")) {
                txs = txs.filter(t => t.type === 'credit');
            } else if (sqlClean.includes("type = 'debit'")) {
                txs = txs.filter(t => t.type === 'debit');
            }

            const total = txs.reduce((sum, t) => sum + t.amount, 0);
            return [[{ total }]];
        }

        // COUNT transactions
        if (sqlClean.includes('SELECT COUNT(*) as count FROM transactions')) {
            const userId = parseInt(params[0]);
            const status = params[1] || 'Auto';
            const count = data.transactions.filter(t => t.user_id === userId && t.status === status).length;
            return [[{ count }]];
        }

        // SELECT * FROM bank_accounts WHERE id = ?
        if (sqlClean.includes('SELECT * FROM bank_accounts WHERE id = ?')) {
            const accId = parseInt(params[0]);
            const userId = params[1] ? parseInt(params[1]) : null;
            const acc = data.bank_accounts.find(a => a.id === accId && (!userId || a.user_id === userId));
            return [acc ? [acc] : []];
        }

        // SELECT * FROM bank_accounts WHERE status = 'approved' AND auto_run = 1 (from server simulation)
        if (sqlClean.includes("SELECT * FROM bank_accounts WHERE status = 'approved' AND auto_run = 1")) {
            const accs = data.bank_accounts.filter(a => a.status === 'approved' && a.auto_run === 1);
            return [accs];
        }

        // SELECT `key`, value FROM settings
        if (sqlClean.includes('SELECT \`key\`, value FROM settings') || sqlClean.includes('SELECT key, value FROM settings')) {
            const rows = Object.entries(data.settings).map(([key, value]) => ({ key, value }));
            return [rows];
        }

        // ADMIN queries
        if (sqlClean.includes("SELECT COUNT(*) as count FROM users WHERE role = 'user'")) {
            const count = data.users.filter(u => u.role === 'user').length;
            return [[{ count }]];
        }
        if (sqlClean.includes("SELECT SUM(amount) as sum FROM transactions WHERE type = 'deposit' AND status = 'approved'")) {
            const sum = data.transactions.filter(t => t.type === 'deposit' && t.status === 'approved').reduce((s, t) => s + t.amount, 0);
            return [[{ sum }]];
        }
        if (sqlClean.includes("SELECT SUM(amount) as sum FROM transactions WHERE type = 'withdrawal' AND status = 'approved'")) {
            const sum = data.transactions.filter(t => t.type === 'withdrawal' && t.status === 'approved').reduce((s, t) => s + t.amount, 0);
            return [[{ sum }]];
        }
        if (sqlClean.includes("SELECT COUNT(*) as count FROM transactions WHERE status = 'pending'")) {
            const count = data.transactions.filter(t => t.status === 'pending').length;
            return [[{ count }]];
        }
        if (sqlClean.includes("SELECT COUNT(*) as count FROM bank_accounts WHERE status = 'pending'")) {
            const count = data.bank_accounts.filter(a => a.status === 'pending').length;
            return [[{ count }]];
        }
        if (sqlClean.includes("SELECT SUM(amount) as sum FROM transactions WHERE status = 'approved' AND DATE(created_at) = CURDATE()")) {
            const sum = data.transactions.filter(t => t.status === 'approved').reduce((s, t) => s + t.amount, 0);
            return [[{ sum }]];
        }

        // SELECT t.*, u.full_name, u.mobile FROM transactions t JOIN users u ON t.user_id = u.id (Recent 10 or all)
        if (sqlClean.includes('FROM transactions t JOIN users u ON t.user_id = u.id')) {
            let txs = [...data.transactions];
            const typeFilter = params[0];
            const statusFilter = params[1];

            if (sqlClean.includes('WHERE t.type = \'deposit\'')) {
                txs = txs.filter(t => t.type === 'deposit');
                if (params[0]) txs = txs.filter(t => t.status === params[0].toLowerCase());
            } else if (sqlClean.includes('WHERE t.type = \'withdrawal\'')) {
                txs = txs.filter(t => t.type === 'withdrawal');
                if (params[0]) txs = txs.filter(t => t.status === params[0].toLowerCase());
            } else {
                if (typeFilter && typeFilter !== 'All') txs = txs.filter(t => t.type === typeFilter.toLowerCase());
                if (statusFilter && statusFilter !== 'All') txs = txs.filter(t => t.status === statusFilter.toLowerCase());
            }

            txs = txs.map(t => {
                const u = data.users.find(usr => usr.id === t.user_id);
                return {
                    ...t,
                    full_name: u ? u.full_name : 'Unknown',
                    mobile: u ? u.mobile : ''
                };
            });
            txs.sort((a, b) => b.id - a.id);
            if (sqlClean.includes('LIMIT 10')) {
                txs = txs.slice(0, 10);
            }
            return [txs];
        }

        // SELECT u.*, (SELECT auto_run FROM bank_accounts WHERE user_id = u.id ORDER BY id DESC LIMIT 1) as auto_run FROM users u WHERE u.role = 'user' ORDER BY u.id DESC
        if (sqlClean.includes("FROM users u") && sqlClean.includes("u.role = 'user'")) {
            let users = data.users.filter(u => u.role === 'user');
            users = users.map(u => {
                const accs = data.bank_accounts.filter(a => a.user_id === u.id);
                accs.sort((a, b) => b.id - a.id);
                const latestAcc = accs[0];
                return {
                    ...u,
                    auto_run: latestAcc ? latestAcc.auto_run : 0
                };
            });
            users.sort((a, b) => b.id - a.id);
            return [users];
        }

        // SELECT b.*, u.full_name, u.mobile FROM bank_accounts b JOIN users u ON b.user_id = u.id
        if (sqlClean.includes('FROM bank_accounts b JOIN users u ON b.user_id = u.id')) {
            let accs = [...data.bank_accounts];
            if (params[0]) {
                accs = accs.filter(a => a.status === params[0].toLowerCase());
            }
            accs = accs.map(a => {
                const u = data.users.find(usr => usr.id === a.user_id);
                return {
                    ...a,
                    full_name: u ? u.full_name : 'Unknown',
                    mobile: u ? u.mobile : ''
                };
            });
            accs.sort((a, b) => b.id - a.id);
            return [accs];
        }

        // UPDATE last_login = CURRENT_TIMESTAMP WHERE id = ?
        if (sqlClean.includes('UPDATE users SET last_login = CURRENT_TIMESTAMP')) {
            const user = data.users.find(u => u.id === parseInt(params[0]));
            if (user) user.last_login = new Date().toISOString();
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE users SET password_hash = ? WHERE id = ?
        if (sqlClean.includes('UPDATE users SET password_hash = ?')) {
            const user = data.users.find(u => u.id === parseInt(params[1]));
            if (user) user.password_hash = params[0];
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE users SET status = ? WHERE id = ?
        if (sqlClean.includes('UPDATE users SET status = ? WHERE id = ?')) {
            const user = data.users.find(u => u.id === parseInt(params[1]));
            if (user) user.status = params[0];
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE bank_accounts SET status = ? WHERE id = ?
        if (sqlClean.includes('UPDATE bank_accounts SET status = ? WHERE id = ?')) {
            const acc = data.bank_accounts.find(a => a.id === parseInt(params[1]));
            if (acc) acc.status = params[0];
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE bank_accounts SET auto_run = ?, status = 'approved' WHERE id = ?
        if (sqlClean.includes("UPDATE bank_accounts SET auto_run = ?, status = 'approved' WHERE id = ?") || sqlClean.includes('UPDATE bank_accounts SET auto_run = ?, status = "approved" WHERE id = ?')) {
            const acc = data.bank_accounts.find(a => a.id === parseInt(params[1]));
            if (acc) {
                acc.auto_run = parseInt(params[0]);
                acc.status = 'approved';
            }
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE bank_accounts SET auto_run = ? WHERE id = ?
        if (sqlClean.includes('UPDATE bank_accounts SET auto_run = ? WHERE id = ?')) {
            const acc = data.bank_accounts.find(a => a.id === parseInt(params[1]));
            if (acc) acc.auto_run = parseInt(params[0]);
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE transactions SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
        if (sqlClean.includes('UPDATE transactions SET status = ?, processed_at = CURRENT_TIMESTAMP')) {
            const tx = data.transactions.find(t => t.id === parseInt(params[1]));
            if (tx) {
                tx.status = params[0];
                tx.processed_at = new Date().toISOString();
            }
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE users SET balance = ? WHERE id = ?
        if (sqlClean.includes('UPDATE users SET balance = ? WHERE id = ?')) {
            const user = data.users.find(u => u.id === parseInt(params[1]));
            if (user) {
                user.balance = parseFloat(params[0]);
                console.log(`[MockDB Set Balance] User ID: ${params[1]}, Set: ${user.balance}`);
            }
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // UPDATE users SET balance = balance + ? WHERE id = ?
        if (sqlClean.includes('UPDATE users SET balance = balance + ? WHERE id = ?')) {
            const user = data.users.find(u => u.id === parseInt(params[1]));
            console.log(`[MockDB Update Balance] User ID: ${params[1]}, Found: ${!!user}, Add: ${params[0]}`);
            if (user) {
                user.balance = (user.balance || 0) + parseFloat(params[0]);
                console.log(`[MockDB Update Balance] New balance is: ${user.balance}`);
            }
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // DELETE FROM users WHERE id = ?
        if (sqlClean.includes('DELETE FROM users WHERE id = ?')) {
            const uId = parseInt(params[0]);
            data.users = data.users.filter(u => u.id !== uId);
            data.bank_accounts = data.bank_accounts.filter(a => a.user_id !== uId);
            data.transactions = data.transactions.filter(t => t.user_id !== uId);
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        // Generic INSERT INTO handler for JSON mock DB
        if (sqlClean.startsWith('INSERT INTO') && !sqlClean.includes('settings')) {
            const parts = sqlClean.split(' ');
            const tableName = parts[2].split('(')[0].trim().replace(/`/g, '');
            
            // Extract columns
            const colsStr = sqlClean.substring(sqlClean.indexOf('(') + 1, sqlClean.indexOf(')'));
            const cols = colsStr.split(',').map(c => c.trim().replace(/`/g, ''));
            
            const newId = data[tableName].length + 1;
            const newRecord = { id: newId };
            
            // Populate columns from params
            cols.forEach((col, index) => {
                let val = params[index];
                if (col === 'user_id' || col === 'account_id' || col === 'auto_run' || col === 'is_verified') {
                    val = val !== undefined && val !== null ? parseInt(val) : 0;
                } else if (col === 'balance' || col === 'amount' || col === 'min_deposit') {
                    val = val !== undefined && val !== null ? parseFloat(val) : 0;
                }
                newRecord[col] = val;
            });
            
            // Set defaults
            if (newRecord.created_at === undefined) newRecord.created_at = new Date().toISOString();
            if (newRecord.status === undefined) newRecord.status = 'pending';
            
            // Special custom status for Auto credit/debit simulation
            if (tableName === 'transactions' && (newRecord.type === 'credit' || newRecord.type === 'debit')) {
                newRecord.status = 'Auto';
                newRecord.processed_at = new Date().toISOString();
            }

            data[tableName].push(newRecord);
            writeDB(data);
            return [{ insertId: newId }];
        }

        // settings upsert
        if (sqlClean.includes('INSERT INTO settings') || sqlClean.includes('ON DUPLICATE KEY UPDATE')) {
            data.settings[params[0]] = params[1];
            writeDB(data);
            return [{ affectedRows: 1 }];
        }

        return [[]];
    }
};

async function initDatabase() {
    if (useMock) {
        console.log('USE_MOCK_DB is enabled. Starting with local JSON database fallback.');
        useMock = true;
        const data = readDB();
        const adminExists = data.users.some(u => u.role === 'admin');
        if (!adminExists) {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('admin123', salt);
            data.users.push({
                id: 1,
                full_name: 'Admin System',
                mobile: 'admin',
                password_hash: hash,
                role: 'admin',
                balance: 0,
                status: 'active',
                is_verified: 1,
                created_at: new Date().toISOString(),
                last_login: null
            });
            writeDB(data);
        }
        return;
    }

    try {
        console.log(`Testing Postgres connection to ${connectionString || pgConfig.host || 'localhost'}...`);
        await realPool.query("SELECT 1");
        useMock = false;
        console.log('Postgres server connected successfully. Initializing PostgreSQL tables...');
        
        // Create Tables
        await realPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                mobile VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'user',
                balance DOUBLE PRECISION DEFAULT 0,
                status VARCHAR(50) DEFAULT 'active',
                is_verified INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL
            )
        `);

        await realPool.query(`
            CREATE TABLE IF NOT EXISTS bank_accounts (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                account_type VARCHAR(255) NOT NULL,
                bank_name VARCHAR(255) NOT NULL,
                holder_name VARCHAR(255) NOT NULL,
                account_number VARCHAR(255) NOT NULL,
                ifsc_code VARCHAR(255) NOT NULL,
                branch_address TEXT,
                upi_id VARCHAR(255),
                status VARCHAR(50) DEFAULT 'pending',
                min_deposit DOUBLE PRECISION DEFAULT 5000,
                auto_run INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await realPool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                account_id INT,
                type VARCHAR(50) NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                remarks TEXT,
                admin_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                processed_at TIMESTAMP NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL
            )
        `);

        await realPool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                "key" VARCHAR(255) PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        // Seed default admin if not exists
        const adminResult = await realPool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        if (adminResult.rows.length === 0) {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('admin123', salt);
            await realPool.query(
                `INSERT INTO users (full_name, mobile, password_hash, role, balance, status, is_verified)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                ['Admin System', 'admin', hash, 'admin', 0, 'active', 1]
            );
            console.log('Default admin seeded in Postgres.');
        }

        // Seed default settings
        const defaultSettings = {
            commission_rate: '10',
            min_withdrawal: '2000',
            banner_text: 'Every transaction commission is 10%. Daily limit applies.',
            saving_min: '5000',
            current_min: '10000',
            corporate_min: '15000',
            admin_upi: 'watchpay@axl'
        };

        for (const [key, value] of Object.entries(defaultSettings)) {
            await realPool.query(
                `INSERT INTO settings ("key", value) VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING`,
                [key, value]
            );
        }

        console.log('Postgres Database initialized successfully.');

    } catch (err) {
        if (!process.env.USE_MOCK_DB || process.env.USE_MOCK_DB !== 'true') {
            console.error('Postgres connection failed and USE_MOCK_DB is not enabled. Please check your DATABASE_URL or DB_HOST settings.');
            throw err;
        }

        console.warn('Postgres server connection failed (ECONNREFUSED / Credentials mismatch).');
        console.warn('FALLING BACK TO LOCAL JSON DATABASE MOCK DRIVER. (Perfect for local testing!)');
        useMock = true;

        // Seed default mock DB if not exists
        const data = readDB();
        const adminExists = data.users.some(u => u.role === 'admin');
        if (!adminExists) {
            const salt = bcrypt.genSaltSync(10);
            const hash = bcrypt.hashSync('admin123', salt);
            data.users.push({
                id: 1,
                full_name: 'Admin System',
                mobile: 'admin',
                password_hash: hash,
                role: 'admin',
                balance: 0,
                status: 'active',
                is_verified: 1,
                created_at: new Date().toISOString(),
                last_login: null
            });
        }

        const defaultSettings = {
            commission_rate: '10',
            min_withdrawal: '2000',
            banner_text: 'Every transaction commission is 10%. Daily limit applies.',
            saving_min: '5000',
            current_min: '10000',
            corporate_min: '15000',
            admin_upi: 'watchpay@axl'
        };

        for (const [key, value] of Object.entries(defaultSettings)) {
            if (data.settings[key] === undefined) {
                data.settings[key] = value;
            }
        }
        writeDB(data);
        console.log('Mock JSON database initialized successfully (watchpay_db.json).');
    }
}

module.exports = {
    pool,
    initDatabase
};
