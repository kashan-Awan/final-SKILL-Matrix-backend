require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort: true,
    instanceName: process.env.DB_INSTANCE
  },
  requestTimeout: 60000,
  connectionTimeout: 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// If a DB_INSTANCE is provided, the port is usually dynamic and handled by the SQL Browser service.
// Specifying a port can lead to connection issues, so we only add it if no instance is named.
if (!process.env.DB_INSTANCE) {
  config.port = parseInt(process.env.DB_PORT) || 1433;
}

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
    const serverId = process.env.DB_INSTANCE
      ? `${config.server}\\${process.env.DB_INSTANCE}`
      : config.server;
    const portInfo = config.port ? ` on port ${config.port}` : ' (dynamic port)';
    console.log(`Connecting to SQL Server: ${serverId}${portInfo}`);
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