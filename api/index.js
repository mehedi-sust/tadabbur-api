// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('../src/routes/auth');
const duaRoutes = require('../src/routes/duas');
const blogRoutes = require('../src/routes/blogs');
const questionRoutes = require('../src/routes/questions');
const userRoutes = require('../src/routes/users');
const aiRoutes = require('../src/routes/ai');
const reportRoutes = require('../src/routes/reports');

// Database initialization
const DatabaseInitializer = require('../src/database/initialize');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting (reduced for serverless)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Reduced limit for serverless
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL === '*' ? true : (process.env.FRONTEND_URL || 'http://localhost:3000'),
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Initialize database on first request
let dbInitialized = false;
const initializeDatabase = async () => {
  if (!dbInitialized) {
    try {
      console.log('🔄 Initializing database...');
      const dbInit = new DatabaseInitializer();
      await dbInit.initialize();
      dbInitialized = true;
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      console.error('Error stack:', error.stack);
      // In production, don't crash the function, just log the error
      if (process.env.NODE_ENV === 'production') {
        console.log('⚠️ Continuing without database initialization in production');
        dbInitialized = true; // Mark as initialized to prevent retries
      } else {
        throw error;
      }
    }
  }
};

// Middleware to ensure database is initialized
app.use(async (req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error('Database initialization error:', error);
    console.error('Error stack:', error.stack);
    
    // In production, continue with limited functionality
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Continuing with limited functionality in production');
      next();
    } else {
      res.status(500).json({ 
        error: 'Database initialization failed',
        message: error.message,
        stack: error.stack
      });
    }
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/duas', duaRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Tadabbur API Server',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.originalUrl
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  console.error('Error stack:', error.stack);
  
  // In production, provide generic error messages
  if (process.env.NODE_ENV === 'production') {
    res.status(error.status || 500).json({
      error: 'Internal Server Error',
      message: 'Something went wrong. Please try again later.'
    });
  } else {
    res.status(error.status || 500).json({
      error: error.message || 'Internal Server Error',
      stack: error.stack
    });
  }
});

// Export for Vercel
module.exports = app;
