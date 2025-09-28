const pool = require('../database/connection');

async function migrateApprovalSystem() {
  try {
    console.log('🔄 Starting approval system migration...');

    // Check if approval_status column exists in duas table
    const duasColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'duas' AND column_name = 'approval_status'
    `);

    if (duasColumnCheck.rows.length === 0) {
      console.log('📝 Adding approval_status column to duas table...');
      await pool.query(`
        ALTER TABLE duas 
        ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending' 
        CHECK (approval_status IN ('pending', 'approved', 'rejected'))
      `);
      console.log('✅ Added approval_status column to duas table');
    } else {
      console.log('ℹ️  approval_status column already exists in duas table');
    }

    // Check if rejection_reason column exists in duas table
    const duasRejectionCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'duas' AND column_name = 'rejection_reason'
    `);

    if (duasRejectionCheck.rows.length === 0) {
      console.log('📝 Adding rejection_reason column to duas table...');
      await pool.query(`
        ALTER TABLE duas 
        ADD COLUMN rejection_reason TEXT
      `);
      console.log('✅ Added rejection_reason column to duas table');
    } else {
      console.log('ℹ️  rejection_reason column already exists in duas table');
    }

    // Check if approval_status column exists in blogs table
    const blogsColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blogs' AND column_name = 'approval_status'
    `);

    if (blogsColumnCheck.rows.length === 0) {
      console.log('📝 Adding approval_status column to blogs table...');
      await pool.query(`
        ALTER TABLE blogs 
        ADD COLUMN approval_status VARCHAR(20) DEFAULT 'pending' 
        CHECK (approval_status IN ('pending', 'approved', 'rejected'))
      `);
      console.log('✅ Added approval_status column to blogs table');
    } else {
      console.log('ℹ️  approval_status column already exists in blogs table');
    }

    // Check if rejection_reason column exists in blogs table
    const blogsRejectionCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blogs' AND column_name = 'rejection_reason'
    `);

    if (blogsRejectionCheck.rows.length === 0) {
      console.log('📝 Adding rejection_reason column to blogs table...');
      await pool.query(`
        ALTER TABLE blogs 
        ADD COLUMN rejection_reason TEXT
      `);
      console.log('✅ Added rejection_reason column to blogs table');
    } else {
      console.log('ℹ️  rejection_reason column already exists in blogs table');
    }

    // Check if is_verified column exists in blogs table
    const blogsVerifiedCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blogs' AND column_name = 'is_verified'
    `);

    if (blogsVerifiedCheck.rows.length === 0) {
      console.log('📝 Adding is_verified column to blogs table...');
      await pool.query(`
        ALTER TABLE blogs 
        ADD COLUMN is_verified BOOLEAN DEFAULT false
      `);
      console.log('✅ Added is_verified column to blogs table');
    } else {
      console.log('ℹ️  is_verified column already exists in blogs table');
    }

    // Check if verified_by column exists in blogs table
    const blogsVerifiedByCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blogs' AND column_name = 'verified_by'
    `);

    if (blogsVerifiedByCheck.rows.length === 0) {
      console.log('📝 Adding verified_by column to blogs table...');
      await pool.query(`
        ALTER TABLE blogs 
        ADD COLUMN verified_by UUID REFERENCES users(id)
      `);
      console.log('✅ Added verified_by column to blogs table');
    } else {
      console.log('ℹ️  verified_by column already exists in blogs table');
    }

    // Check if verified_at column exists in blogs table
    const blogsVerifiedAtCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'blogs' AND column_name = 'verified_at'
    `);

    if (blogsVerifiedAtCheck.rows.length === 0) {
      console.log('📝 Adding verified_at column to blogs table...');
      await pool.query(`
        ALTER TABLE blogs 
        ADD COLUMN verified_at TIMESTAMP
      `);
      console.log('✅ Added verified_at column to blogs table');
    } else {
      console.log('ℹ️  verified_at column already exists in blogs table');
    }

    // Check if notifications table exists
    const notificationsTableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'notifications'
    `);

    if (notificationsTableCheck.rows.length === 0) {
      console.log('📝 Creating notifications table...');
      await pool.query(`
        CREATE TABLE notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL CHECK (type IN ('approval', 'rejection', 'role_change', 'system')),
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          content_type VARCHAR(20) CHECK (content_type IN ('dua', 'blog')),
          content_id UUID,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Created notifications table');
    } else {
      console.log('ℹ️  notifications table already exists');
    }

    // Create indexes for better performance
    console.log('📝 Creating indexes...');
    
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_duas_approval_status ON duas(approval_status)');
      console.log('✅ Created index on duas.approval_status');
    } catch (error) {
      console.log('ℹ️  Index on duas.approval_status may already exist');
    }

    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_blogs_approval_status ON blogs(approval_status)');
      console.log('✅ Created index on blogs.approval_status');
    } catch (error) {
      console.log('ℹ️  Index on blogs.approval_status may already exist');
    }

    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)');
      console.log('✅ Created index on notifications.user_id');
    } catch (error) {
      console.log('ℹ️  Index on notifications.user_id may already exist');
    }

    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)');
      console.log('✅ Created index on notifications.is_read');
    } catch (error) {
      console.log('ℹ️  Index on notifications.is_read may already exist');
    }

    // Update existing public duas to approved status
    console.log('📝 Updating existing public duas to approved status...');
    const updateDuasResult = await pool.query(`
      UPDATE duas 
      SET approval_status = 'approved' 
      WHERE is_public = true AND approval_status = 'pending'
    `);
    console.log(`✅ Updated ${updateDuasResult.rowCount} duas to approved status`);

    // Update existing published blogs to approved status
    console.log('📝 Updating existing published blogs to approved status...');
    const updateBlogsResult = await pool.query(`
      UPDATE blogs 
      SET approval_status = 'approved' 
      WHERE is_published = true AND approval_status = 'pending'
    `);
    console.log(`✅ Updated ${updateBlogsResult.rowCount} blogs to approved status`);

    console.log('🎉 Approval system migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateApprovalSystem()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migrateApprovalSystem;
