require('dotenv').config();
const { getPool, sql } = require('./src/config/db');

(async () => {
  try {
    const pool = await getPool();
    
    // Restore ALL deleted users
    const result = await pool.request().query(
      `UPDATE dawlance_user SET is_deleted = 0 WHERE is_deleted = 1`
    );
    
    console.log(`✅ Restored ${result.rowsAffected[0]} users!`);
    
    // Now show the restored users
    const activeUsers = await pool.request().query(
      `SELECT TOP 5 email, role, name FROM dawlance_user WHERE is_deleted = 0 ORDER BY createdAt DESC`
    );
    
    console.log('\nActive users now:');
    activeUsers.recordset.forEach(u => {
      console.log(`  ${u.email} | ${u.role} | ${u.name}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
