require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 58525,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort: true,
  },
  requestTimeout: 60000,
  connectionTimeout: 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool = null;

const getPool = async () => {
  if (pool && pool.connected) {
    return pool;
  }

  if (pool) {
    try {
      await pool.close();
    } catch (err) {
      console.warn('Warning: Could not close old pool:', err.message);
    }
    pool = null;
  }

  try {
    console.log(`Connecting to SQL Server: ${config.server} on port ${config.port}`);
    pool = await sql.connect(config);
    console.log('✅ SQL Server connection established.');
    return pool;
  } catch (err) {
    pool = null;
    console.error('❌ Database connection failed:', err.message);
    throw err;
  }
};

module.exports = { sql, getPool };