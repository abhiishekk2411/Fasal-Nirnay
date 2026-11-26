require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');

const marketRoutes = require('./routes/marketRoutes');
const decisionRoutes = require('./routes/decisionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const historyRoutes = require('./routes/historyRoutes');
const visionRoutes = require('./routes/visionRoutes');
const ivrRoutes = require('./routes/ivrRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Essential for Exotel Passthru webhooks
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173'
}));

// API 1: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: "FasalNirnay backend is running"
  });
});

// Mount Routes
app.use('/api/markets', marketRoutes);
app.use('/api/decision', decisionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/vision', visionRoutes);
app.use('/api/ivr', ivrRoutes);

// Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

module.exports = app;
