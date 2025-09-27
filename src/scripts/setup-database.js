#!/usr/bin/env node

/**
 * Database Setup Script
 * 
 * This script initializes the database schema and can be run:
 * 1. Locally during development
 * 2. During Vercel deployment
 * 3. As a standalone script
 */

require('dotenv').config();
const path = require('path');
const DatabaseInitializer = require('../database/initialize');
const pool = require('../database/connection');

async function setupDatabase() {
  try {
    console.log('🚀 Starting database setup...');
    
    // Test database connection
    console.log('📡 Testing database connection...');
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful');
    
    // Initialize schema
    console.log('📝 Initializing database schema...');
    const dbInitializer = new DatabaseInitializer();
    
    const schemaInitialized = await dbInitializer.initialize();
    if (schemaInitialized) {
      console.log('✅ Database schema initialized');
    } else {
      console.log('ℹ️  Database schema already exists');
    }
    
    // Seed default data
    console.log('🌱 Seeding default data...');
    await dbInitializer.seedDefaultData();
    console.log('✅ Default data seeded');
    
    console.log('🎉 Database setup completed successfully!');
    
    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📋 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔒 Database connections closed');
    process.exit(0);
  }
}

// Handle different invocation contexts
if (require.main === module) {
  setupDatabase().catch(console.error);
} else {
  module.exports = { setupDatabase };
}
