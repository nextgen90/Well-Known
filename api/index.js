const { app, initDatabase } = require('../server');

let initialized = false;

module.exports = async (req, res) => {
  try {
    if (!initialized) {
      await initDatabase();
      initialized = true;
    }
    return app(req, res);
  } catch (err) {
    console.error('Vercel function failed to initialize:', err);
    res.status(500).send('Server initialization failed');
  }
};
