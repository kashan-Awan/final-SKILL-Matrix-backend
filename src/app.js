const express = require('express');
const cors = require('cors');
const path = require('path');               // ← ADD THIS
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173', 'http://localhost:3000'];
// console.log(allowedOrigins);
// app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files from the 'public' folder (one level above src)
app.use(express.static(path.join(__dirname, '../public')));   // ← ADD THIS

app.get('/health', (req, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api', routes);

app.use(errorHandler);

module.exports = app;