const fs = require('fs');
const path = require('path');
const pool = require('./connection');

class DatabaseInitializer {
  constructor() {
    this.schemaPath = path.join(__dirname, 'schema.sql');
  }

  async initialize() {
    try {
      console.log('🔍 Checking database schema...');
      
      // Check if tables exist
      const tablesExist = await this.checkTablesExist();
      
      if (!tablesExist) {
        console.log('📝 Initializing database schema...');
        await this.runSchema();
        console.log('✅ Database schema initialized successfully');
      } else {
        console.log('✅ Database schema is up to date');
        
        // Run migrations to ensure new tables exist
        try {
          await this.runMigrations();
        } catch (migrationError) {
          console.warn('⚠️ Migration failed, continuing:', migrationError.message);
        }
      }
      
      // Always run seeding (with duplicate checks)
      try {
        await this.seedDefaultData();
      } catch (seedError) {
        console.warn('⚠️ Seeding failed, continuing:', seedError.message);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async checkTablesExist() {
    try {
      const requiredTables = [
        'users', 'duas', 'dua_categories', 'dua_category_relations',
        'blogs', 'questions', 'answers', 'user_collections',
        'collection_items', 'ai_processing_queue', 'user_preferences', 'dua_likes'
      ];

      for (const table of requiredTables) {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [table]);
        
        if (!result.rows[0].exists) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error checking tables:', error);
      return false;
    }
  }

  async runSchema() {
    try {
      const schemaSQL = fs.readFileSync(this.schemaPath, 'utf8');
      
      // Simple splitting by semicolon, making sure we keep the full DO blocks
      const statements = schemaSQL
        .replace(/--.*$/gm, '') // Remove comments
        .replace(/\n\s*\n/g, '\n') // Remove empty lines
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);
      
      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await pool.query(statement);
          } catch (error) {
            // Skip common non-fatal errors
            const skipErrors = [
              'already exists',
              'duplicate key',
              'relation already exists',
              'insert or update on table violates',
              'notifications_enabled column',
              'column does not exist',
              'value already exists'
            ];
            
            const shouldSkip = skipErrors.some(pattern =>
              error.message.toLowerCase().includes(pattern.toLowerCase())
            );
            
            if (shouldSkip) {
              console.log(`ℹ️  Skipped: ${statement.substring(0, 50)}...`);
            } else {
              console.error(`❌ SQL Error: ${error.message}`);
              console.error(`Statement: ${statement.substring(0, 100)}...`);
              throw error;
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error reading or executing schema:', error);
      throw error;
    }
  }

  async seedDefaultData() {
    try {
      const bcrypt = require('bcryptjs');
      
      // Check if admin user exists
      const adminUser = await pool.query('SELECT id, email FROM users WHERE email = $1', ['admin@mydua.com']);
      
      if (adminUser.rows.length === 0) {
        console.log('🌱 Seeding default admin user...');
        const defaultPassword = 'Admin123!@#';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        try {
          const insertResult = await pool.query(`
            INSERT INTO users (name, email, password_hash, role, is_active) VALUES
            ($1, $2, $3, $4, $5) RETURNING id
          `, ['System Admin', 'admin@mydua.com', hashedPassword, 'admin', true]);
          
          const adminUser = insertResult.rows[0];
          
          // Create default user preferences for admin
          try {
            await pool.query(
              'INSERT INTO user_preferences (user_id) VALUES ($1)',
              [adminUser.id]
            );
            console.log('✅ Admin user preferences created');
          } catch (prefError) {
            console.log('ℹ️  Admin preferences may already exist');
          }
          
          console.log(`✅ Admin user created successfully!`);
          console.log(`📧 Email: admin@mydua.com`);
          console.log(`🔑 Password: ${defaultPassword}`);
          console.log(`⚠️  IMPORTANT: Please change the admin password after first login!`);
        } catch (insertError) {
          if (insertError.code === '23505') { // Unique violation
            console.log('ℹ️  Admin user already exists (created by another process)');
          } else {
            throw insertError;
          }
        }
      } else {
        console.log('ℹ️  Admin user already exists - no changes needed');
        console.log(`📧 Found admin with email: ${adminUser.rows[0].email}`);
        
        // Verify the admin password is still correct by testing it
        try {
          const testResult = await pool.query(
            'SELECT password_hash FROM users WHERE email = $1',
            ['admin@mydua.com']
          );
          
          const bcrypt = require('bcryptjs');
          const isValidPassword = await bcrypt.compare('Admin123!@#', testResult.rows[0].password_hash);
          
          if (!isValidPassword) {
            console.log('⚠️  Admin password hash needs refresh - updating...');
            const newHash = await bcrypt.hash('Admin123!@#', 10);
            await pool.query(
              'UPDATE users SET password_hash = $1 WHERE email = $2',
              [newHash, 'admin@mydua.com']
            );
            console.log('✅ Admin password hash refreshed');
          } else {
            console.log('✅ Admin password verification passed');
          }
        } catch (verifyError) {
          console.warn('⚠️  Admin password verification failed:', verifyError.message);
        }
      }
      
      // Seed categories only if none exist
      await this.seedCategories();
      
    } catch (error) {
      console.error('Error seeding default data:', error);
      throw error;
    }
  }

  async seedCategories() {
    try {
      const categories = await pool.query('SELECT COUNT(*) FROM dua_categories');
      
      if (parseInt(categories.rows[0].count) === 0) {
        console.log('🌱 Seeding default categories...');
        await pool.query(`
          INSERT INTO dua_categories (name, description) VALUES
          ('Morning Duas', 'Duas to be recited in the morning'),
          ('Evening Duas', 'Duas to be recited in the evening'),
          ('Prayer Duas', 'Duas related to Salah'),
          ('Supplications', 'General supplications'),
          ('Zikr', 'Remembrance of Allah'),
          ('Protection Duas', 'Duas for protection and safety'),
          ('Healing Duas', 'Duas for health and healing'),
          ('Forgiveness Duas', 'Duas seeking forgiveness'),
          ('Guidance Duas', 'Duas for guidance and wisdom'),
          ('Gratitude Duas', 'Duas expressing gratitude')
        `);
        console.log('✅ Categories seeded successfully');
      } else {
        console.log('ℹ️  Categories already exist - no changes needed');
      }
    } catch (error) {
      console.error('Error seeding categories:', error);
      throw error;
    }
  }

  async runMigrations() {
    try {
      console.log('🔄 Running database migrations...');
      
      // Check if dua_likes table exists and create it if missing
      await this.ensureTableExists('dua_likes', `
        CREATE TABLE IF NOT EXISTS dua_likes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          dua_id UUID REFERENCES duas(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(dua_id, user_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_dua_likes_dua_id ON dua_likes(dua_id);
        CREATE INDEX IF NOT EXISTS idx_dua_likes_user_id ON dua_likes(user_id);
      `);

      // Run approval system migration
      try {
        const migrateApprovalSystem = require('../scripts/migrate-approval-system');
        await migrateApprovalSystem();
      } catch (migrationError) {
        console.warn('⚠️  Approval system migration failed, continuing:', migrationError.message);
      }
      
      console.log('✅ Database migrations completed');
    } catch (error) {
      console.error('Error running migrations:', error);
      // Don't throw error for migration failures - let the app continue
      console.log('⚠️  Some migrations may have failed, but app will continue');
    }
  }

  async ensureTableExists(tableName, createStatement) {
    try {
      // Check if table exists
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [tableName]);
      
      if (!result.rows[0].exists) {
        console.log(`📝 Creating missing table: ${tableName}`);
        await pool.query(createStatement);
        console.log(`✅ Table ${tableName} created successfully`);
      } else {
        console.log(`ℹ️  Table ${tableName} already exists`);
      }
    } catch (error) {
      const skipErrors = [
        'already exists', 'relation already exists', 'duplicate key'
      ];
      
      const shouldSkip = skipErrors.some(pattern =>
        error.message.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (shouldSkip) {
        console.log(`ℹ️  Skipped ${tableName} migration - already complete`);
      } else {
        throw error;
      }
    }
  }
}

module.exports = DatabaseInitializer;
