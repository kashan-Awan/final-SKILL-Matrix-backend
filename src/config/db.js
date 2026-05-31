require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,                    
  port: parseInt(process.env.DB_PORT),              
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
  },
  requestTimeout: 60000,
  connectionTimeout: 30000,
};

let pool;

const getPool = async () => {
  if (!pool) {
    pool = await sql.connect(config);
    console.log('Database connected successfully');
  }
  return pool;
};

module.exports = { sql, getPool };