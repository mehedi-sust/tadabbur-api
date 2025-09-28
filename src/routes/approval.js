const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper function to create notification
const createNotification = async (userId, type, title, message, contentType = null, contentId = null) => {
  try {
    console.log('Creating notification:', { userId, type, title, message, contentType, contentId });
    const result = await pool.query(`
      INSERT INTO notifications (user_id, type, title, message, content_type, content_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [userId, type, title, message, contentType, contentId]);
    console.log('Notification created successfully:', result.rows[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    console.error('Notification data:', { userId, type, title, message, contentType, contentId });
  }
};

// Get pending content for approval (Scholar, Manager, Admin)
router.get('/pending', authenticateToken, requireRole(['scholar', 'manager', 'admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const contentType = req.query.type || 'all'; // 'dua', 'blog', or 'all'

    let query = '';
    let countQuery = '';
    let params = [];

    if (contentType === 'dua') {
      query = `
        SELECT d.*, u.name as author_name,
               array_agg(DISTINCT dc.name) as categories
        FROM duas d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
        LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
        WHERE d.approval_status = 'pending' AND d.is_public = true
        GROUP BY d.id, u.name
        ORDER BY d.created_at ASC
        LIMIT $1 OFFSET $2
      `;
      countQuery = `
        SELECT COUNT(*) as total
        FROM duas d
        WHERE d.approval_status = 'pending' AND d.is_public = true
      `;
      params = [limit, offset];
    } else if (contentType === 'blog') {
      query = `
        SELECT b.*, u.name as author_name
        FROM blogs b
        LEFT JOIN users u ON b.author_id = u.id
        WHERE b.approval_status = 'pending'
        ORDER BY b.created_at ASC
        LIMIT $1 OFFSET $2
      `;
      countQuery = `
        SELECT COUNT(*) as total
        FROM blogs b
        WHERE b.approval_status = 'pending'
      `;
      params = [limit, offset];
    } else {
      // Get both duas and blogs
      query = `
        SELECT 
          'dua' as content_type,
          d.id,
          d.title,
          d.created_at,
          d.updated_at,
          u.name as author_name,
          d.approval_status,
          d.rejection_reason,
          array_agg(DISTINCT dc.name) as categories
        FROM duas d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
        LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
        WHERE d.approval_status = 'pending' AND d.is_public = true
        GROUP BY d.id, u.name
        
        UNION ALL
        
        SELECT 
          'blog' as content_type,
          b.id,
          b.title,
          b.created_at,
          b.updated_at,
          u.name as author_name,
          b.approval_status,
          b.rejection_reason,
          ARRAY[]::text[] as categories
        FROM blogs b
        LEFT JOIN users u ON b.author_id = u.id
        WHERE b.approval_status = 'pending'
        
        ORDER BY created_at ASC
        LIMIT $1 OFFSET $2
      `;
      countQuery = `
        SELECT (
          (SELECT COUNT(*) FROM duas WHERE approval_status = 'pending' AND is_public = true) +
          (SELECT COUNT(*) FROM blogs WHERE approval_status = 'pending')
        ) as total
      `;
      params = [limit, offset];
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery)
    ]);

    const total = parseInt(countResult.rows[0].total);

    res.json({
      content: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get pending content error:', error);
    res.status(500).json({ error: 'Failed to fetch pending content' });
  }
});

// Approve content (Scholar, Manager, Admin)
router.post('/:type/:id/approve', authenticateToken, requireRole(['scholar', 'manager', 'admin']), async (req, res) => {
  try {
    const { type, id } = req.params;
    const { notes } = req.body;

    if (!['dua', 'blog'].includes(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    let query = '';
    let authorQuery = '';
    let authorId = null;

    if (type === 'dua') {
      // Get author ID first
      const authorResult = await pool.query('SELECT user_id FROM duas WHERE id = $1', [id]);
      if (authorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Dua not found' });
      }
      authorId = authorResult.rows[0].user_id;

      query = `
        UPDATE duas 
        SET approval_status = 'approved', 
            is_verified = true,
            verified_by = $1,
            verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
    } else {
      // Get author ID first
      const authorResult = await pool.query('SELECT author_id FROM blogs WHERE id = $1', [id]);
      if (authorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Blog not found' });
      }
      authorId = authorResult.rows[0].author_id;

      query = `
        UPDATE blogs 
        SET approval_status = 'approved', 
            is_verified = true,
            verified_by = $1,
            verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
    }

    const result = await pool.query(query, [req.user.id, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Create notification for author
    console.log('Creating approval notification for author:', authorId);
    await createNotification(
      authorId,
      'approval',
      `${type === 'dua' ? 'Dua' : 'Blog'} Approved`,
      `Your ${type} "${result.rows[0].title}" has been approved and is now visible to the public.`,
      type,
      id
    );

    res.json({
      message: `${type} approved successfully`,
      content: result.rows[0]
    });
  } catch (error) {
    console.error('Approve content error:', error);
    res.status(500).json({ error: 'Failed to approve content' });
  }
});

// Reject content (Scholar, Manager, Admin)
router.post('/:type/:id/reject', authenticateToken, requireRole(['scholar', 'manager', 'admin']), [
  body('reason').trim().isLength({ min: 10 }).withMessage('Rejection reason must be at least 10 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, id } = req.params;
    const { reason } = req.body;

    if (!['dua', 'blog'].includes(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    let query = '';
    let authorId = null;

    if (type === 'dua') {
      // Get author ID first
      const authorResult = await pool.query('SELECT user_id FROM duas WHERE id = $1', [id]);
      if (authorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Dua not found' });
      }
      authorId = authorResult.rows[0].user_id;

      query = `
        UPDATE duas 
        SET approval_status = 'rejected', 
            rejection_reason = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
    } else {
      // Get author ID first
      const authorResult = await pool.query('SELECT author_id FROM blogs WHERE id = $1', [id]);
      if (authorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Blog not found' });
      }
      authorId = authorResult.rows[0].author_id;

      query = `
        UPDATE blogs 
        SET approval_status = 'rejected', 
            rejection_reason = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
    }

    const result = await pool.query(query, [reason, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Create notification for author
    console.log('Creating rejection notification for author:', authorId);
    await createNotification(
      authorId,
      'rejection',
      `${type === 'dua' ? 'Dua' : 'Blog'} Rejected`,
      `Your ${type} "${result.rows[0].title}" has been rejected. Reason: ${reason}`,
      type,
      id
    );

    res.json({
      message: `${type} rejected successfully`,
      content: result.rows[0]
    });
  } catch (error) {
    console.error('Reject content error:', error);
    res.status(500).json({ error: 'Failed to reject content' });
  }
});

// Get content details for approval (Scholar, Manager, Admin)
router.get('/:type/:id', authenticateToken, requireRole(['scholar', 'manager', 'admin']), async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!['dua', 'blog'].includes(type)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    let query = '';

    if (type === 'dua') {
      query = `
        SELECT d.*, u.name as author_name, u.email as author_email,
               array_agg(DISTINCT dc.name) as categories
        FROM duas d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
        LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
        WHERE d.id = $1
        GROUP BY d.id, u.name, u.email
      `;
    } else {
      query = `
        SELECT b.*, u.name as author_name, u.email as author_email
        FROM blogs b
        LEFT JOIN users u ON b.author_id = u.id
        WHERE b.id = $1
      `;
    }

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get content details error:', error);
    res.status(500).json({ error: 'Failed to fetch content details' });
  }
});

// Get approval statistics (Manager, Admin)
router.get('/stats', authenticateToken, requireRole(['manager', 'admin']), async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        'dua' as content_type,
        approval_status,
        COUNT(*) as count
      FROM duas 
      WHERE is_public = true
      GROUP BY approval_status
      
      UNION ALL
      
      SELECT 
        'blog' as content_type,
        approval_status,
        COUNT(*) as count
      FROM blogs 
      GROUP BY approval_status
      
      ORDER BY content_type, approval_status
    `;

    const result = await pool.query(statsQuery);
    
    const stats = {
      dua: { pending: 0, approved: 0, rejected: 0 },
      blog: { pending: 0, approved: 0, rejected: 0 }
    };

    result.rows.forEach(row => {
      stats[row.content_type][row.approval_status] = parseInt(row.count);
    });

    res.json(stats);
  } catch (error) {
    console.error('Get approval stats error:', error);
    res.status(500).json({ error: 'Failed to fetch approval statistics' });
  }
});

module.exports = router;
