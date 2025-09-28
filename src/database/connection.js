const { Pool } = require('pg');
require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';

// Enhanced database configuration for different environments
const getDatabaseConfig = () => {
  const config = {
    connectionString: isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
    ssl: false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    acquireTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };

  // Production configuration for Vercel (optimized)
  if (process.env.NODE_ENV === 'production') {
    config.ssl = { rejectUnauthorized: false };
    config.max = 15; // Increased with more memory
    config.idleTimeoutMillis = 60000; // 1 minute
    config.connectionTimeoutMillis = 5000; // 5 seconds
    config.acquireTimeoutMillis = 15000; // 15 seconds
  }

  // Development configuration
  if (process.env.NODE_ENV === 'development') {
    config.max = 5; // Small pool for development
    config.idleTimeoutMillis = 30000;
    config.connectionTimeoutMillis = 2000;
  }

  return config;
};

const pool = new Pool(getDatabaseConfig());

// Enhanced error handling and logging
pool.on('connect', (client) => {
  const environment = process.env.NODE_ENV || 'development';
  console.log(`✅ Connected to ${isTest ? 'test' : environment} database`);
  
  // Set timezone for the connection
  client.query('SET timezone = "UTC"').catch(err => {
    console.warn('Could not set timezone:', err.message);
  });
});

pool.on('error', (err, client) => {
  console.error('💥 Database connection error:', err);
  
  // Don't exit process in production, log and continue
  if (process.env.NODE_ENV !== 'production') {
    console.error('Exiting process due to database error...');
    process.exit(1);
  }
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Closing database connections...');
  await pool.end();
  process.exit(0);
});

module.exports = pool;
