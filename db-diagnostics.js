require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'Dawlance_Skil_Matrix',
  options: {
    encrypt: false, // Set to true if using Azure
    trustServerCertificate: true,
    connectTimeout: 30000
  },
};

// Priority logic: If an instance name is provided, don't use a hardcoded port
if (process.env.DB_INSTANCE) {
  config.instanceName = process.env.DB_INSTANCE;
} else {
  config.port = parseInt(process.env.DB_PORT) || 1433;
}

async function testConnection() {
  console.log('Testing connection with config:', { ...config, password: '****' });
  try {
    const pool = await sql.connect(config);
    console.log('✅ Success! Connected to SQL Server.');
    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log('Server Version:', result.recordset[0].version);
    await pool.close();
  } catch (err) {
    console.error('❌ Connection Failed!');
    console.error('Error Code:', err.code);
    console.error('Original Error:', err.originalError ? err.originalError.message : err.message);
    console.log('\nTip: If you see "ETIMEOUT", check your Firewall or TCP/IP settings.');
    console.log('Tip: If you see "ECONNREFUSED", ensure SQL Server Service is running on the specified port.');
  }
}

testConnection();