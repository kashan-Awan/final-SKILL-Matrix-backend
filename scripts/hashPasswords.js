require('dotenv').config();
const bcrypt = require('bcrypt');
const { sql, getPool } = require('../src/config/db');

async function fixPlainTextPasswords() {
  const pool = await getPool();

  // Get all users
  const result = await pool.request().query('SELECT _id, email, password FROM dawlance_user');
  const users = result.recordset;

  for (const user of users) {
    // Skip already hashed
    if (user.password?.startsWith('$2b$') || user.password?.startsWith('$2a$')) {
      console.log(` Already hashed: ${user.email}`);
      continue;
    }

    // Skip NULL
    if (!user.password) {
      console.log(`⚠️ Skipping NULL: ${user.email}`);
      continue;
    }

    // Hash and update
    const hashed = await bcrypt.hash(user.password, 10);
    await pool.request()
      .input('hashed', sql.NVarChar, hashed)
      .input('id', sql.NVarChar, user._id)
      .query('UPDATE dawlance_user SET password = @hashed WHERE _id = @id');

    console.log(`🔒 Fixed: ${user.email}`);
  }

  console.log(' All done!');
  process.exit(0);
}

fixPlainTextPasswords().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});