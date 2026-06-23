require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('./src/config/db');

async function checkUser() {
  const email = 'ayesha.khan@gmail.com';
  const password = 'Test1234';

  const pool = await getPool();
  const result = await pool
    .request()
    .input('email', sql.NVarChar, email.toLowerCase())
    .query(`SELECT _id, name, email, role, password, is_deleted FROM dawlance_user WHERE email = @email`);

  if (!result.recordset.length) {
    console.log('❌ User NOT found in database.');
    return;
  }

  const user = result.recordset[0];
  console.log('✅ User found:');
  console.log('  Name     :', user.name);
  console.log('  Email    :', user.email);
  console.log('  Role     :', user.role);
  console.log('  Deleted  :', user.is_deleted);
  console.log('  Password hash:', user.password);

  const isBcrypt = user.password && user.password.startsWith('$2');
  console.log('\n  Is bcrypt hash?', isBcrypt ? '✅ Yes' : '❌ No (plain text or wrong format)');

  if (isBcrypt) {
    const match = await bcrypt.compare(password, user.password);
    console.log(`  Does "Test1234" match hash? ${match ? '✅ Yes' : '❌ No'}`);
  } else {
    console.log('  Plain text match?', user.password === password ? '✅ Yes' : '❌ No');
  }

  process.exit(0);
}

checkUser().catch(err => { console.error(err.message); process.exit(1); });
