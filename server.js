require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getPool } = require('./src/config/db');
const routes = require('./src/routes');
const errorHandler = require('./src/middleware/errorHandler');

const PORT = process.env.PORT || 5001;

const app = express();

// Middleware
// const allowedOrigins = process.env.FRONTEND_URL
//   ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
//   : ['http://localhost:3000', 'http://localhost:5173'];

app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', routes);

// Health check
app.get('/health', async (req, res) => {
  try {
    const pool = await getPool();
    if (pool.connected) {
      return res.json({ success: true, status: 'ok', database: 'connected' });
    }
    throw new Error('Database pool exists but is not connected');
  } catch (err) {
    res.status(503).json({ success: false, status: 'error', message: err.message });
  }
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await getPool();
    console.log('✅ SQL Server connection established.');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('Check your DB_SERVER and DB_INSTANCE in .env');
  }
});