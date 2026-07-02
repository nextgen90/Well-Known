const serverless = require('serverless-http');
const { app, initDatabase } = require('../server');

module.exports = async (req, res) => {
  try {
    await initDatabase();
    return serverless(app)(req, res);
  } catch (err) {
    console.error('Vercel function failed to initialize:', err);
    res.status(500).send('Server initialization failed');
  }
};
