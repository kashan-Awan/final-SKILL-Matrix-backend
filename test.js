const bcrypt = require('bcryptjs');

const hash = '$2b$10$OIH3c696b/CUNAkCr6nDCO3y1wvsKKl74W/m0oiH94LKe3svQhE6u';
const password = 'Admin@1234';

bcrypt.compare(password, hash).then(r => {
  console.log('Password match:', r);
});