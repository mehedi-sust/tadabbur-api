const pool = require('../src/database/connection');
const bcrypt = require('bcryptjs');

async function verifyAdminUser() {
  try {
    console.log('🔍 Checking admin user...');
    
    // Check if admin exists
    const adminResult = await pool.query('SELECT id, email, role, is_active FROM users WHERE email = $1', ['admin@mydua.com']);
    
    if (adminResult.rows.length === 0) {
      console.log('❌ Admin user not found, creating...');
      
      // Create admin user
      const defaultPassword = 'Admin123!@#';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      
      const insertResult = await pool.query(`
        INSERT INTO users (name, email, password_hash, role, is_active) VALUES
        ($1, $2, $3, $4, $5) RETURNING id
      `, ['System Admin', 'admin@mydua.com', hashedPassword, 'admin', true]);
      
      const adminUser = insertResult.rows[0];
      
      // Create user preferences
      await pool.query(
        'INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [adminUser.id]
      );
      
      console.log('✅ Admin user created successfully!');
      console.log(`📧 Email: admin@mydua.com`);
      console.log(`🔑 Password: ${defaultPassword}`);
      
    } else {
      const admin = adminResult.rows[0];
      console.log('✅ Admin user found');
      console.log(`📧 Email: ${admin.email}`);
      console.log(`👑 Role: ${admin.role}`);
      console.log(`🔒 Active: ${admin.is_active}`);
      
      // Test the password
      const userResult = await pool.query(
        'SELECT password_hash FROM users WHERE email = $1',
        ['admin@mydua.com']
      );
      
      const { password_hash } = userResult.rows[0];
      const isValid = await bcrypt.compare('Admin123!@#', password_hash);
      
      if (isValid) {
        console.log('✅ Admin password is correct');
      } else {
        console.log('❌ Admin password is incorrect, resetting...');
        
        const newPasswordHash = await bcrypt.hash('Admin123!@#', 10);
        await pool.query(
          'UPDATE users SET password_hash = $1 WHERE email = $2',
          [newPasswordHash, 'admin@mydua.com']
        );
        console.log('✅ Admin password reset');
      }
    }
    
    console.log('🎉 Admin verification complete');
    
  } catch (error) {
    console.error('❌ Error verifying admin:', error);
  } finally {
    await pool.end();
  }
}

// Run the verification
verifyAdminUser();
