require('dotenv').config();
const { getPool, sql } = require('./src/config/db');

(async () => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT email, role, name, is_deleted FROM dawlance_user ORDER BY createdAt DESC`
    );
    
    if (result.recordset.length === 0) {
      console.log('❌ No users found in database');
    } else {
      console.log(`\n✅ Found ${result.recordset.length} users:\n`);
      result.recordset.forEach(u => {
        console.log(`  Email: ${u.email}`);
        console.log(`  Role:  ${u.role}`);
        console.log(`  Name:  ${u.name}`);
        console.log(`  Active: ${u.is_deleted === 0 ? 'Yes' : 'No (Deleted)'}`);
        console.log('  ---');
      });
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
