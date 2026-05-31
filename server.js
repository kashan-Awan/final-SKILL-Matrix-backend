require('dotenv').config();
const app = require('./src/app');
const { getPool } = require('./src/config/db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await getPool();
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
});
