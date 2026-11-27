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
const voiceRoutes = require('./routes/voiceRoutes');
const chatRoutes = require('./routes/chatRoutes');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Essential for Exotel Passthru webhooks
// CORS Configuration for Production & Local Development
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^https:\/\/.*\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive fallback for deployment access
    }
  },
  credentials: true
}));

// Health Check Endpoints
app.get('/', (req, res) => {
  res.status(200).json({ status: "ok", service: "Fasal-Nirnay API" });
});

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
app.use('/api/voice', voiceRoutes);
app.use('/api/chat', chatRoutes);

// Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

module.exports = app;
