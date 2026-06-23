const { getPool, sql } = require('./src/config/db');

(async () => {
  const pool = await getPool();

  // Look up the user
  const r = await pool.request()
    .input('email', sql.NVarChar, 'ayesha.khan@dawlance.com')
    .query('SELECT _id, employeeId, name, email, role, password, is_deleted FROM dawlance_user WHERE email = @email');

  if (!r.recordset.length) {
    console.log('USER NOT FOUND in database');
  } else {
    const u = r.recordset[0];
    console.log('User found:');
    console.log('  id:', u._id);
    console.log('  name:', u.name);
    console.log('  role:', u.role);
    console.log('  is_deleted:', u.is_deleted);
    console.log('  has password:', !!u.password);
    console.log('  password hash:', u.password);

    // Test password match
    const bcrypt = require('bcryptjs');
    const match = await bcrypt.compare('Test1234', u.password);
    console.log('  "Test1234" matches hash:', match);
  }

  // Also list all users
  const all = await pool.request().query('SELECT name, email, role, is_deleted FROM dawlance_user WHERE is_deleted = 0');
  console.log('\nAll active users:');
  all.recordset.forEach(u => console.log(' ', u.email, '|', u.role, '|', u.name));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
