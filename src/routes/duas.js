const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken, requireScholar } = require('../middleware/auth');

const router = express.Router();

// Helper function to ensure dua_likes table exists
async function ensureLikesTableExists() {
  try {
    // Check if dua_likes table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'dua_likes'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('📝 Creating dua_likes table...');
      await pool.query(`
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
      console.log('✅ dua_likes table created successfully');
    }
  } catch (error) {
    console.log('⚠️ Error creating dua_likes table: ', error.message);
  }
}

// Get all public duas with pagination and filters
router.get('/', async (req, res) => {
  try {
    await ensureLikesTableExists();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const verified = req.query.verified;

    let query = `
      SELECT d.*, u.name as author_name, 
             array_agg(DISTINCT dc.name) as categories,
             COALESCE(cl.likes_count, 0) as likes_count
      FROM duas d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      LEFT JOIN (
        SELECT dua_id, COUNT(*) as likes_count 
        FROM dua_likes 
        GROUP BY dua_id
      ) cl ON d.id = cl.dua_id
      WHERE d.is_public = true AND d.approval_status = 'approved'
    `;
    
    const queryParams = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (d.title ILIKE $${paramCount} OR d.purpose ILIKE $${paramCount} OR d.english_meaning ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    if (category) {
      query += ` AND dc.name = $${paramCount}`;
      queryParams.push(category);
      paramCount++;
    }

    if (verified !== undefined) {
      query += ` AND d.is_verified = $${paramCount}`;
      queryParams.push(verified === 'true');
      paramCount++;
    }

    query += ` GROUP BY d.id, u.name, cl.likes_count ORDER BY d.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT d.id) as total
      FROM duas d
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      WHERE d.is_public = true AND d.approval_status = 'approved'
    `;
    
    const countParams = [];
    paramCount = 1;

    if (search) {
      countQuery += ` AND (d.title ILIKE $${paramCount} OR d.purpose ILIKE $${paramCount} OR d.english_meaning ILIKE $${paramCount})`;
      countParams.push(`%${search}%`);
      paramCount++;
    }

    if (category) {
      countQuery += ` AND dc.name = $${paramCount}`;
      countParams.push(category);
      paramCount++;
    }

    if (verified !== undefined) {
      countQuery += ` AND d.is_verified = $${paramCount}`;
      countParams.push(verified === 'true');
      paramCount++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      duas: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get duas error:', error);
    res.status(500).json({ error: 'Failed to fetch duas' });
  }
});

// Get user's own duas
router.get('/my-duas', authenticateToken, async (req, res) => {
  try {
    await ensureLikesTableExists();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query = `
      SELECT d.*, u.name as author_name, u.name as user_name,
             array_agg(DISTINCT dc.name) as categories,
             COALESCE(cl.likes_count, 0) as likes_count
      FROM duas d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      LEFT JOIN (
        SELECT dua_id, COUNT(*) as likes_count 
        FROM dua_likes 
        GROUP BY dua_id
      ) cl ON d.id = cl.dua_id
      WHERE d.user_id = $1
    `;
    
    const queryParams = [req.user.id];
    let paramCount = 2;

    if (search) {
      query += ` AND (d.title ILIKE $${paramCount} OR d.purpose ILIKE $${paramCount} OR d.english_meaning ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    query += ` GROUP BY d.id, u.name, cl.likes_count ORDER BY d.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM duas WHERE user_id = $1`;
    const countParams = [req.user.id];

    if (search) {
      countQuery += ` AND (title ILIKE $2 OR purpose ILIKE $2 OR english_meaning ILIKE $2)`;
      countParams.push(`%${search}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      duas: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my duas error:', error);
    res.status(500).json({ error: 'Failed to fetch your duas' });
  }
});

// Get single dua by ID (for authenticated users)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureLikesTableExists();
    const duaId = req.params.id;
    console.log('🔍 [Authenticated] Fetching dua details for ID:', duaId, 'User:', req.user?.id);
    
    const result = await pool.query(`
      SELECT d.*, u.name as author_name, 
             array_agg(DISTINCT dc.name) as categories,
             COALESCE(cl.likes_count, 0) as likes_count
      FROM duas d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      LEFT JOIN (
        SELECT dua_id, COUNT(*) as likes_count 
        FROM dua_likes 
        GROUP BY dua_id
      ) cl ON d.id = cl.dua_id
      WHERE d.id = $1 AND (d.is_public = true OR d.user_id = $2)
      GROUP BY d.id, u.name, cl.likes_count
    `, [duaId, req.user.id]);

    if (result.rows.length === 0) {
      console.log('❌ Dua not found for ID:', duaId);
      return res.status(404).json({ error: 'Dua not found' });
    }

    console.log('✅ Dua found:', result.rows[0].id);
    res.json({ dua: result.rows[0] });
  } catch (error) {
    console.error('❌ Get dua error:', error);
    res.status(500).json({ error: 'Failed to fetch dua' });
  }
});

// Get public dua by ID (anyone can access public duas)
router.get('/public/:id', async (req, res) => {
  try {
    const duaId = req.params.id;
    console.log('🔍 [Public] Fetching public dua details for ID:', duaId);
    
    const result = await pool.query(`
      SELECT d.*, u.name as author_name, 
             array_agg(DISTINCT dc.name) as categories,
             COALESCE(cl.likes_count, 0) as likes_count
      FROM duas d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      LEFT JOIN (
        SELECT dua_id, COUNT(*) as likes_count 
        FROM dua_likes 
        GROUP BY dua_id
      ) cl ON d.id = cl.dua_id
      WHERE d.id = $1 AND d.is_public = true
      GROUP BY d.id, u.name, cl.likes_count
    `, [duaId]);

    if (result.rows.length === 0) {
      console.log('❌ Public dua not found for ID:', duaId);
      return res.status(404).json({ error: 'Dua not found' });
    }

    console.log('✅ Public dua found:', result.rows[0].id);
    res.json({ dua: result.rows[0] });
  } catch (error) {
    console.error('❌ Get public dua error:', error);
    res.status(500).json({ error: 'Failed to fetch dua' });
  }
});

// Create new dua
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required and must be 1-500 characters'),
  body('purpose').optional().trim().isLength({ max: 1000 }).withMessage('Purpose must be max 1000 characters'),
  body('arabic_text').optional().trim(),
  body('english_meaning').optional().trim(),
  body('transliteration').optional().trim(),
  body('native_meaning').trim().isLength({ min: 1 }).withMessage('Native meaning is required'),
  body('source_reference').trim().isLength({ min: 1 }).withMessage('Source reference is required'),
  body('categories').optional().isArray().withMessage('Categories must be an array'),
  body('is_public').optional().isBoolean().withMessage('is_public must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      purpose,
      arabic_text,
      english_meaning,
      transliteration,
      native_meaning,
      source_reference,
      categories = [],
      is_public = false
    } = req.body;

    // Create dua
    const result = await pool.query(`
      INSERT INTO duas (user_id, title, purpose, arabic_text, english_meaning, transliteration, native_meaning, source_reference, is_public)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [req.user.id, title, purpose, arabic_text, english_meaning, transliteration, native_meaning, source_reference, is_public]);

    const dua = result.rows[0];

    // Add categories if specified
    if (categories.length > 0) {
      for (const categoryName of categories) {
        // Get or create category
        let categoryResult = await pool.query('SELECT id FROM dua_categories WHERE name = $1', [categoryName]);
        let categoryId;

        if (categoryResult.rows.length === 0) {
          const newCategory = await pool.query('INSERT INTO dua_categories (name) VALUES ($1) RETURNING id', [categoryName]);
          categoryId = newCategory.rows[0].id;
        } else {
          categoryId = categoryResult.rows[0].id;
        }

        // Link dua to category
        await pool.query('INSERT INTO dua_category_relations (dua_id, category_id) VALUES ($1, $2)', [dua.id, categoryId]);
      }
    }

    // Queue for AI processing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('dua', $1, 'pending')
    `, [dua.id]);

    res.status(201).json({
      message: 'Dua created successfully',
      dua
    });
  } catch (error) {
    console.error('Create dua error:', error);
    res.status(500).json({ error: 'Failed to create dua' });
  }
});

// Update dua
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if dua exists and user owns it
    const existingDua = await pool.query('SELECT * FROM duas WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (existingDua.rows.length === 0) {
      return res.status(404).json({ error: 'Dua not found or access denied' });
    }

    const {
      title,
      purpose,
      arabic_text,
      english_meaning,
      transliteration,
      native_meaning,
      source_reference,
      categories = undefined,
      is_public
    } = req.body;

    // Build UPDATE query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }

    if (purpose !== undefined) {
      updates.push(`purpose = $${paramCount}`);
      values.push(purpose);
      paramCount++;
    }

    if (arabic_text !== undefined) {
      updates.push(`arabic_text = $${paramCount}`);
      values.push(arabic_text);
      paramCount++;
    }

    if (english_meaning !== undefined) {
      updates.push(`english_meaning = $${paramCount}`);
      values.push(english_meaning);
      paramCount++;
    }

    if (transliteration !== undefined) {
      updates.push(`transliteration = $${paramCount}`);
      values.push(transliteration);
      paramCount++;
    }

    if (native_meaning !== undefined) {
      updates.push(`native_meaning = $${paramCount}`);
      values.push(native_meaning);
      paramCount++;
    }

    if (source_reference !== undefined) {
      updates.push(`source_reference = $${paramCount}`);
      values.push(source_reference);
      paramCount++;
    }

    if (is_public !== undefined) {
      updates.push(`is_public = $${paramCount}`);
      values.push(is_public);
      paramCount++;
      
      // If making public, set approval status to pending
      if (is_public === true) {
        updates.push(`approval_status = 'pending'`);
      }
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE duas SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    // Update categories if provided
    if (categories !== undefined) {
      // Remove existing categories
      await pool.query('DELETE FROM dua_category_relations WHERE dua_id = $1', [req.params.id]);

      // Add new categories
      if (categories.length > 0) {
        for (const categoryName of categories) {
          let categoryResult = await pool.query('SELECT id FROM dua_categories WHERE name = $1', [categoryName]);
          let categoryId;

          if (categoryResult.rows.length === 0) {
            const newCategory = await pool.query('INSERT INTO dua_categories (name) VALUES ($1) RETURNING id', [categoryName]);
            categoryId = newCategory.rows[0].id;
          } else {
            categoryId = categoryResult.rows[0].id;
          }

          await pool.query('INSERT INTO dua_category_relations (dua_id, category_id) VALUES ($1, $2)', [req.params.id, categoryId]);
        }
      }
    }

    // Queue for AI reprocessing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('dua', $1, 'pending')
    `, [req.params.id]);

    res.json({
      message: 'Dua updated successfully',
      dua: result.rows[0]
    });
  } catch (error) {
    console.error('Update dua error:', error);
    res.status(500).json({ error: 'Failed to update dua' });
  }
});

// Delete dua
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM duas WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dua not found or access denied' });
    }

    res.json({ message: 'Dua deleted successfully' });
  } catch (error) {
    console.error('Delete dua error:', error);
    res.status(500).json({ error: 'Failed to delete dua' });
  }
});

// Verify dua (scholars only)
router.post('/:id/verify', authenticateToken, requireScholar, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE duas 
      SET is_verified = true, verified_by = $1, verified_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND is_public = true
      RETURNING *
    `, [req.user.id, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Public dua not found' });
    }

    res.json({
      message: 'Dua verified successfully',
      dua: result.rows[0]
    });
  } catch (error) {
    console.error('Verify dua error:', error);
    res.status(500).json({ error: 'Failed to verify dua' });
  }
});

// Like a dua
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    await ensureLikesTableExists();
    const duaId = req.params.id;
    const userId = req.user.id;

    // Check if dua exists and is public or owned by user
    const duaCheck = await pool.query(`
      SELECT id FROM duas 
      WHERE id = $1 AND (is_public = true OR user_id = $2)
    `, [duaId, userId]);

    if (duaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dua not found or access denied' });
    }

    // Check if already liked
    const existingLike = await pool.query(`
      SELECT id FROM dua_likes WHERE dua_id = $1 AND user_id = $2
    `, [duaId, userId]);

    if (existingLike.rows.length > 0) {
      return res.status(400).json({ error: 'Dua already liked' });
    }

    // Add like
    await pool.query(`
      INSERT INTO dua_likes (dua_id, user_id) VALUES ($1, $2)
    `, [duaId, userId]);

    // Get updated likes count
    const likesResult = await pool.query(`
      SELECT COUNT(*) as likes_count FROM dua_likes WHERE dua_id = $1
    `, [duaId]);

    res.json({
      message: 'Dua liked successfully',
      likes_count: parseInt(likesResult.rows[0].likes_count)
    });
  } catch (error) {
    console.error('Like dua error:', error);
    res.status(500).json({ error: 'Failed to like dua' });
  }
});

// Unlike a dua
router.delete('/:id/like', authenticateToken, async (req, res) => {
  try {
    const duaId = req.params.id;
    const userId = req.user.id;

    // Remove like
    const result = await pool.query(`
      DELETE FROM dua_likes WHERE dua_id = $1 AND user_id = $2
    `, [duaId, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Like not found' });
    }

    // Get updated likes count
    const likesResult = await pool.query(`
      SELECT COUNT(*) as likes_count FROM dua_likes WHERE dua_id = $1
    `, [duaId]);

    res.json({
      message: 'Like removed successfully',
      likes_count: parseInt(likesResult.rows[0].likes_count)
    });
  } catch (error) {
    console.error('Unlike dua error:', error);
    res.status(500).json({ error: 'Failed to remove like' });
  }
});

// Get like status for current user and likes count for a dua
router.get('/:id/likes', authenticateToken, async (req, res) => {
  try {
    const duaId = req.params.id;
    const userId = req.user.id;

    // Get user's like status and total likes count
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM dua_likes WHERE dua_id = $1) as total_likes,
        CASE WHEN EXISTS(SELECT 1 FROM dua_likes WHERE dua_id = $1 AND user_id = $2) 
        THEN true ELSE false END as is_liked
    `, [duaId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unable to fetch like status' });
    }

    const data = result.rows[0];
    res.json({
      likes_count: parseInt(data.total_likes),
      is_liked: data.is_liked
    });
  } catch (error) {
    console.error('Get like status error:', error);
    res.status(500).json({ error: 'Failed to fetch like status' });
  }
});

module.exports = router;