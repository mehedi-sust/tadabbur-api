const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken, requireScholar } = require('../middleware/auth');
const { withPerformanceTracking } = require('../utils/performance');

const router = express.Router();

// Initialize performance monitor
const performanceMonitor = new PerformanceMonitor();

// Optimized query for getting duas with better indexing
const getDuasOptimized = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50); // Cap at 50
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const verified = req.query.verified;

    // Use a single optimized query with CTE for better performance
    const query = `
      WITH dua_data AS (
        SELECT 
          d.id,
          d.title,
          d.purpose,
          d.arabic_text,
          d.transliteration,
          d.english_meaning,
          d.native_meaning,
          d.source_reference,
          d.is_verified,
          d.created_at,
          d.updated_at,
          u.name as author_name,
          COALESCE(cl.likes_count, 0) as likes_count
        FROM duas d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN (
          SELECT dua_id, COUNT(*) as likes_count 
          FROM dua_likes 
          GROUP BY dua_id
        ) cl ON d.id = cl.dua_id
        WHERE d.is_public = true
        ${search ? 'AND (d.title ILIKE $1 OR d.purpose ILIKE $1 OR d.english_meaning ILIKE $1)' : ''}
        ${verified !== undefined ? `AND d.is_verified = $${search ? '2' : '1'}` : ''}
      ),
      categories_data AS (
        SELECT 
          dcr.dua_id,
          array_agg(dc.name) as categories
        FROM dua_category_relations dcr
        JOIN dua_categories dc ON dcr.category_id = dc.id
        ${category ? 'WHERE dc.name = $' + (search ? '3' : verified !== undefined ? '2' : '1') : ''}
        GROUP BY dcr.dua_id
      )
      SELECT 
        dd.*,
        COALESCE(cd.categories, ARRAY[]::text[]) as categories
      FROM dua_data dd
      LEFT JOIN categories_data cd ON dd.id = cd.dua_id
      ${category ? 'WHERE cd.categories IS NOT NULL' : ''}
      ORDER BY dd.created_at DESC
      LIMIT $${search ? (verified !== undefined ? '3' : '2') : (verified !== undefined ? '2' : '1')} 
      OFFSET $${search ? (verified !== undefined ? '4' : '3') : (verified !== undefined ? '3' : '2')}
    `;

    const params = [];
    if (search) params.push(`%${search}%`);
    if (verified !== undefined) params.push(verified === 'true');
    if (category) params.push(category);
    params.push(limit, offset);

    const result = await withPerformanceTracking(performanceMonitor, 'get_duas')(async () => {
      return await pool.query(query, params);
    });

    // Optimized count query
    const countQuery = `
      SELECT COUNT(DISTINCT d.id) as total
      FROM duas d
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      WHERE d.is_public = true
      ${search ? 'AND (d.title ILIKE $1 OR d.purpose ILIKE $1 OR d.english_meaning ILIKE $1)' : ''}
      ${verified !== undefined ? `AND d.is_verified = $${search ? '2' : '1'}` : ''}
      ${category ? `AND dc.name = $${search ? (verified !== undefined ? '3' : '2') : (verified !== undefined ? '2' : '1')}` : ''}
    `;

    const countParams = [];
    if (search) countParams.push(`%${search}%`);
    if (verified !== undefined) countParams.push(verified === 'true');
    if (category) countParams.push(category);

    const countResult = await withPerformanceTracking(performanceMonitor, 'count_duas')(async () => {
      return await pool.query(countQuery, countParams);
    });

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
};

// Get all public duas with pagination and filters (optimized)
router.get('/', getDuasOptimized);

// Get user's own duas (optimized)
router.get('/my-duas', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const query = `
      SELECT d.*, u.name,
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
      GROUP BY d.id, u.name, cl.likes_count
      ORDER BY d.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await withPerformanceTracking(performanceMonitor, 'get_my_duas')(async () => {
      return await pool.query(query, [req.user.id, limit, offset]);
    });

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM duas d
      WHERE d.user_id = $1
    `;

    const countResult = await withPerformanceTracking(performanceMonitor, 'count_my_duas')(async () => {
      return await pool.query(countQuery, [req.user.id]);
    });

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
    res.status(500).json({ error: 'Failed to fetch user duas' });
  }
});

// Get single dua by ID (optimized)
router.get('/:id', async (req, res) => {
  try {
    const query = `
      SELECT d.*, u.name as author_name,
             array_agg(DISTINCT dc.name) as categories,
             COALESCE(cl.likes_count, 0) as likes_count,
             CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END as user_liked
      FROM duas d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN dua_category_relations dcr ON d.id = dcr.dua_id
      LEFT JOIN dua_categories dc ON dcr.category_id = dc.id
      LEFT JOIN (
        SELECT dua_id, COUNT(*) as likes_count 
        FROM dua_likes 
        GROUP BY dua_id
      ) cl ON d.id = cl.dua_id
      LEFT JOIN dua_likes ul ON d.id = ul.dua_id AND ul.user_id = $2
      WHERE d.id = $1
      GROUP BY d.id, u.name, cl.likes_count, ul.user_id
    `;

    const userId = req.user?.id || null;
    const result = await withPerformanceTracking(performanceMonitor, 'get_dua_by_id')(async () => {
      return await pool.query(query, [req.params.id, userId]);
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dua not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get dua error:', error);
    res.status(500).json({ error: 'Failed to fetch dua' });
  }
});

// Performance stats endpoint for duas
router.get('/stats/performance', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    res.json({
      duas: performanceMonitor.getAllStats()
    });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;
