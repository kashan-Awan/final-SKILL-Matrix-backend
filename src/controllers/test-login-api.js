const axios = require('axios');

const CONFIG = {
  url: 'http://localhost:5000/api/auth/login',
  payload: {
    email: 'abdul.shakoor@dawlance.com', 
    password: 'Shakoor1234',      
    role: 'employee'                     
  }
};

async function testLogin() {
  console.log('--- Testing Login API ---');
  console.log('Target:', CONFIG.url);
  console.log('Payload:', JSON.stringify(CONFIG.payload, null, 2));

  try {
    const response = await axios.post(CONFIG.url, CONFIG.payload);
    
    console.log('\n✅ STATUS:', response.status);
    console.log('✅ MESSAGE:', response.data.message);
    console.log('✅ TOKEN RECEIVED:', response.data.data.token ? 'Yes' : 'No');
    console.log('✅ USER DATA:', JSON.stringify(response.data.data.user, null, 2));

    // Check for trailing spaces which often cause frontend issues
    const role = response.data.data.user.role;
    if (role !== role.trim()) {
      console.error('\n⚠️ WARNING: The returned role has trailing spaces! Check DB column types.');
    }

  } catch (error) {
    console.error('\n❌ LOGIN FAILED');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error Message:', error.message);
      console.error('Tip: Make sure your server is running on port 5000');
    }
  }
}

testLogin();