const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173'];
console.log(allowedOrigins);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api', routes);

// Error Handler
app.use(errorHandler);

module.exports = app;