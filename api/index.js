// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { LRUCache } = require('lru-cache');
require('dotenv').config();

// Initialize cache for static data
const cache = new LRUCache({
  max: 100, // Maximum number of items
  ttl: 1000 * 60 * 5, // 5 minutes TTL
});

const authRoutes = require('../src/routes/auth');
const duaRoutes = require('../src/routes/duas');
const blogRoutes = require('../src/routes/blogs');
const questionRoutes = require('../src/routes/questions');
const userRoutes = require('../src/routes/users');
const aiRoutes = require('../src/routes/ai');
const reportRoutes = require('../src/routes/reports');

// Database initialization
const DatabaseInitializer = require('../src/database/initialize');

// Performance monitoring
const { PerformanceMonitor, performanceMiddleware } = require('../src/utils/performance');
const performanceMonitor = new PerformanceMonitor();

const app = express();

// Compression middleware (should be first)
app.use(compression());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false
}));

// Rate limiting (optimized for serverless)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased limit with more memory
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL === '*' ? true : (process.env.FRONTEND_URL || 'http://localhost:3000'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware (optimized)
app.use(express.json({ 
  limit: '5mb', // Reduced limit for better performance
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '5mb' // Reduced limit
}));

// Cache middleware for static data
const cacheMiddleware = (duration = 300) => {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cached = cache.get(key);
    
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }
    
    res.set('X-Cache', 'MISS');
    res.jsonResponse = res.json;
    res.json = (data) => {
      cache.set(key, data, { ttl: duration * 1000 });
      res.jsonResponse(data);
    };
    next();
  };
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

// Performance stats endpoint (admin only)
app.get('/api/performance', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    res.json({
      stats: performanceMonitor.getAllStats(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      cache: {
        size: cache.size,
        max: cache.max,
        ttl: cache.ttl
      }
    });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Initialize database on first request (optimized)
let dbInitialized = false;
let dbInitPromise = null;

const initializeDatabase = async () => {
  if (dbInitialized) return;
  
  if (dbInitPromise) {
    return dbInitPromise;
  }
  
  dbInitPromise = (async () => {
    try {
      console.log('🔄 Initializing database...');
      const dbInit = new DatabaseInitializer();
      await dbInit.initialize();
      dbInitialized = true;
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      // In production, don't crash the function, just log the error
      if (process.env.NODE_ENV === 'production') {
        console.log('⚠️ Continuing without database initialization in production');
        dbInitialized = true; // Mark as initialized to prevent retries
      } else {
        throw error;
      }
    }
  })();
  
  return dbInitPromise;
};

// Performance monitoring middleware
app.use(performanceMiddleware(performanceMonitor));

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

// API Routes with caching for static data
app.use('/api/auth', authRoutes);
app.use('/api/duas', duaRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);

// Cache static endpoints
app.get('/api/categories', cacheMiddleware(600)); // Cache for 10 minutes
app.get('/api/duas/public', cacheMiddleware(300)); // Cache for 5 minutes

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
