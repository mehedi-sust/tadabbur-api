const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken, requireAdmin, requireManager } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin/manager only)
router.get('/', authenticateToken, requireManager, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const role = req.query.role || '';
    const search = req.query.search || '';

    let query = `
      SELECT u.id, u.name, u.email, u.role, u.native_language, u.is_active, u.created_at
      FROM users u
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 1;

    if (role) {
      query += ` AND u.role = $${paramCount}`;
      queryParams.push(role);
      paramCount++;
    }

    if (search) {
      query += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM users u WHERE 1=1`;
    const countParams = [];
    paramCount = 1;

    if (role) {
      countQuery += ` AND u.role = $${paramCount}`;
      countParams.push(role);
      paramCount++;
    }

    if (search) {
      countQuery += ` AND (u.name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      countParams.push(`%${search}%`);
      paramCount++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID (admin/manager only)
router.get('/:id', authenticateToken, requireManager, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.native_language, u.is_active, u.created_at, u.updated_at,
             up.theme, up.language, up.dua_view_mode, up.notifications_enabled
      FROM users u
      LEFT JOIN user_preferences up ON u.id = up.user_id
      WHERE u.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user role (admin only)
router.put('/:id/role', authenticateToken, requireAdmin, [
  body('role').isIn(['admin', 'manager', 'scholar', 'user']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { role } = req.body;
    const userId = req.params.id;

    // Prevent admin from changing their own role
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const result = await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, email, role',
      [role, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User role updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Activate/Deactivate user (admin only)
router.put('/:id/status', authenticateToken, requireAdmin, [
  body('is_active').isBoolean().withMessage('is_active must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { is_active } = req.body;
    const userId = req.params.id;

    // Prevent admin from deactivating themselves
    if (userId === req.user.id && !is_active) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const result = await pool.query(
      'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, email, is_active',
      [is_active, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Get user statistics (admin/manager only)
router.get('/stats/overview', authenticateToken, requireManager, async (req, res) => {
  try {
    const stats = await Promise.all([
      // Total users
      pool.query('SELECT COUNT(*) as total FROM users'),
      // Users by role
      pool.query('SELECT role, COUNT(*) as count FROM users GROUP BY role'),
      // Active users
      pool.query('SELECT COUNT(*) as active FROM users WHERE is_active = true'),
      // Recent registrations (last 30 days)
      pool.query('SELECT COUNT(*) as recent FROM users WHERE created_at >= NOW() - INTERVAL \'30 days\''),
      // Total duas
      pool.query('SELECT COUNT(*) as total FROM duas'),
      // Public duas
      pool.query('SELECT COUNT(*) as public FROM duas WHERE is_public = true'),
      // Verified duas
      pool.query('SELECT COUNT(*) as verified FROM duas WHERE is_verified = true'),
      // Total blogs
      pool.query('SELECT COUNT(*) as total FROM blogs'),
      // Published blogs
      pool.query('SELECT COUNT(*) as published FROM blogs WHERE is_published = true'),
      // Total questions
      pool.query('SELECT COUNT(*) as total FROM questions'),
      // Answered questions
      pool.query('SELECT COUNT(*) as answered FROM questions WHERE is_answered = true')
    ]);

    res.json({
      users: {
        total: parseInt(stats[0].rows[0].total),
        by_role: stats[1].rows,
        active: parseInt(stats[2].rows[0].active),
        recent_registrations: parseInt(stats[3].rows[0].recent)
      },
      duas: {
        total: parseInt(stats[4].rows[0].total),
        public: parseInt(stats[5].rows[0].public),
        verified: parseInt(stats[6].rows[0].verified)
      },
      blogs: {
        total: parseInt(stats[7].rows[0].total),
        published: parseInt(stats[8].rows[0].published)
      },
      questions: {
        total: parseInt(stats[9].rows[0].total),
        answered: parseInt(stats[10].rows[0].answered)
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

// Update user preferences
router.put('/preferences', authenticateToken, [
  body('theme').optional().isIn(['light', 'dark']).withMessage('Theme must be light or dark'),
  body('language').optional().isLength({ max: 50 }).withMessage('Language must be max 50 characters'),
  body('dua_view_mode').optional().isIn(['grid', 'list']).withMessage('View mode must be grid or list'),
  body('notifications_enabled').optional().isBoolean().withMessage('notifications_enabled must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { theme, language, dua_view_mode, notifications_enabled } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (theme !== undefined) {
      updates.push(`theme = $${paramCount}`);
      values.push(theme);
      paramCount++;
    }
    if (language !== undefined) {
      updates.push(`language = $${paramCount}`);
      values.push(language);
      paramCount++;
    }
    if (dua_view_mode !== undefined) {
      updates.push(`dua_view_mode = $${paramCount}`);
      values.push(dua_view_mode);
      paramCount++;
    }
    if (notifications_enabled !== undefined) {
      updates.push(`notifications_enabled = $${paramCount}`);
      values.push(notifications_enabled);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.user.id);

    const result = await pool.query(
      `UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = $${paramCount} RETURNING *`,
      values
    );

    res.json({
      message: 'Preferences updated successfully',
      preferences: result.rows[0]
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get user collections
router.get('/collections/my-collections', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT uc.*, COUNT(ci.id) as dua_count
      FROM user_collections uc
      LEFT JOIN collection_items ci ON uc.id = ci.collection_id
      WHERE uc.user_id = $1
      GROUP BY uc.id
      ORDER BY uc.created_at DESC
    `, [req.user.id]);

    res.json({ collections: result.rows });
  } catch (error) {
    console.error('Get collections error:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Create user collection
router.post('/collections', authenticateToken, [
  body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be 1-255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be max 1000 characters'),
  body('is_public').optional().isBoolean().withMessage('is_public must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, is_public = false } = req.body;

    const result = await pool.query(`
      INSERT INTO user_collections (user_id, name, description, is_public)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.user.id, name, description, is_public]);

    res.status(201).json({
      message: 'Collection created successfully',
      collection: result.rows[0]
    });
  } catch (error) {
    console.error('Create collection error:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

// Add dua to collection
router.post('/collections/:collectionId/duas/:duaId', authenticateToken, async (req, res) => {
  try {
    const { collectionId, duaId } = req.params;

    // Check if collection belongs to user
    const collectionResult = await pool.query('SELECT id FROM user_collections WHERE id = $1 AND user_id = $2', [collectionId, req.user.id]);
    if (collectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Check if dua exists and user has access
    const duaResult = await pool.query('SELECT id FROM duas WHERE id = $1 AND (user_id = $2 OR is_public = true)', [duaId, req.user.id]);
    if (duaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dua not found or access denied' });
    }

    // Add to collection
    await pool.query(`
      INSERT INTO collection_items (collection_id, dua_id)
      VALUES ($1, $2)
      ON CONFLICT (collection_id, dua_id) DO NOTHING
    `, [collectionId, duaId]);

    res.json({ message: 'Dua added to collection successfully' });
  } catch (error) {
    console.error('Add dua to collection error:', error);
    res.status(500).json({ error: 'Failed to add dua to collection' });
  }
});

module.exports = router;
