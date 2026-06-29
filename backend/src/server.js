/**
 * Express Server Entry Point
 * Finance Module - ERP System
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { testConnection, logger } = require('./config/database');
const routes = require('./routes');
const leaveAccrualScheduler = require('./scheduler/leaveAccrual.scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// General API rate limiter — 300 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict auth rate limiter — 15 login attempts per 15 minutes per IP
// This blocks brute-force attacks on the login endpoint
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: { success: false, error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts toward the limit
});

// Apply auth limiter first (for auth routes)
app.use('/api/auth/', authLimiter);

// Apply general limiter to all other API routes
app.use('/api/', (req, res, next) => {
  // Skip auth routes as they already have their own limiter
  if (req.path.includes('/auth/')) {
    return next();
  }
  return limiter(req, res, next);
});

// Body parsing — 2mb max (file uploads use multipart, not JSON)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Finance Module - ERP System                         ║
║           Server started successfully                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                  ║
║  Environment: ${process.env.NODE_ENV || 'development'}                              ║
║  Database: Connected                                          ║
╚═══════════════════════════════════════════════════════════════╝
      `);

      // Start leave accrual scheduler (fires monthly on the 25th)
      leaveAccrualScheduler.start();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
