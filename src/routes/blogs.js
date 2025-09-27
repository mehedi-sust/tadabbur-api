const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken, requireScholar } = require('../middleware/auth');

const router = express.Router();

// Get all published blogs with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const tag = req.query.tag || '';

    let query = `
      SELECT b.*, u.name as author_name
      FROM blogs b
      LEFT JOIN users u ON b.author_id = u.id
      WHERE b.is_published = true
    `;
    
    const queryParams = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (b.title ILIKE $${paramCount} OR b.content ILIKE $${paramCount} OR b.excerpt ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    if (tag) {
      query += ` AND $${paramCount} = ANY(b.tags)`;
      queryParams.push(tag);
      paramCount++;
    }

    query += ` ORDER BY b.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM blogs b
      WHERE b.is_published = true
    `;
    
    const countParams = [];
    paramCount = 1;

    if (search) {
      countQuery += ` AND (b.title ILIKE $${paramCount} OR b.content ILIKE $${paramCount} OR b.excerpt ILIKE $${paramCount})`;
      countParams.push(`%${search}%`);
      paramCount++;
    }

    if (tag) {
      countQuery += ` AND $${paramCount} = ANY(b.tags)`;
      countParams.push(tag);
      paramCount++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      blogs: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// Get single blog by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, u.name as author_name
      FROM blogs b
      LEFT JOIN users u ON b.author_id = u.id
      WHERE b.id = $1 AND b.is_published = true
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Blog not found' });
    }

    // Increment view count
    await pool.query('UPDATE blogs SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);

    res.json({ blog: result.rows[0] });
  } catch (error) {
    console.error('Get blog error:', error);
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

// Get user's own blogs
router.get('/my-blogs', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT * FROM blogs 
      WHERE author_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const countResult = await pool.query('SELECT COUNT(*) as total FROM blogs WHERE author_id = $1', [req.user.id]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      blogs: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my blogs error:', error);
    res.status(500).json({ error: 'Failed to fetch your blogs' });
  }
});

// Create new blog
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required and must be 1-500 characters'),
  body('content').trim().isLength({ min: 100 }).withMessage('Content must be at least 100 characters'),
  body('excerpt').optional().trim().isLength({ max: 500 }).withMessage('Excerpt must be max 500 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, excerpt, tags = [] } = req.body;

    // Generate excerpt if not provided
    const generatedExcerpt = excerpt || content.substring(0, 200) + '...';

    const result = await pool.query(`
      INSERT INTO blogs (author_id, title, content, excerpt, tags)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, title, content, generatedExcerpt, tags]);

    const blog = result.rows[0];

    // Queue for AI processing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('blog', $1, 'pending')
    `, [blog.id]);

    res.status(201).json({
      message: 'Blog created successfully',
      blog
    });
  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({ error: 'Failed to create blog' });
  }
});

// Update blog
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 500 }).withMessage('Title must be 1-500 characters'),
  body('content').optional().trim().isLength({ min: 100 }).withMessage('Content must be at least 100 characters'),
  body('excerpt').optional().trim().isLength({ max: 500 }).withMessage('Excerpt must be max 500 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('is_published').optional().isBoolean().withMessage('is_published must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if blog exists and user owns it
    const existingBlog = await pool.query('SELECT * FROM blogs WHERE id = $1 AND author_id = $2', [req.params.id, req.user.id]);
    if (existingBlog.rows.length === 0) {
      return res.status(404).json({ error: 'Blog not found or access denied' });
    }

    const { title, content, excerpt, tags, is_published } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }
    if (content !== undefined) {
      updates.push(`content = $${paramCount}`);
      values.push(content);
      paramCount++;
    }
    if (excerpt !== undefined) {
      updates.push(`excerpt = $${paramCount}`);
      values.push(excerpt);
      paramCount++;
    }
    if (tags !== undefined) {
      updates.push(`tags = $${paramCount}`);
      values.push(tags);
      paramCount++;
    }
    if (is_published !== undefined) {
      updates.push(`is_published = $${paramCount}`);
      values.push(is_published);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE blogs SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    // Queue for AI reprocessing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('blog', $1, 'pending')
    `, [req.params.id]);

    res.json({
      message: 'Blog updated successfully',
      blog: result.rows[0]
    });
  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({ error: 'Failed to update blog' });
  }
});

// Delete blog
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM blogs WHERE id = $1 AND author_id = $2 RETURNING id', [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Blog not found or access denied' });
    }

    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({ error: 'Failed to delete blog' });
  }
});

// Get popular tags
router.get('/tags/popular', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT unnest(tags) as tag, COUNT(*) as count
      FROM blogs
      WHERE is_published = true AND tags IS NOT NULL
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 20
    `);

    res.json({ tags: result.rows });
  } catch (error) {
    console.error('Get popular tags error:', error);
    res.status(500).json({ error: 'Failed to fetch popular tags' });
  }
});

module.exports = router;
