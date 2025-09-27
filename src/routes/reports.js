const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Report content
router.post('/report', 
  authenticateToken,
  [
    body('contentType').isIn(['dua', 'blog']).withMessage('Content type must be dua or blog'),
    body('contentId').isUUID().withMessage('Content ID must be a valid UUID'),
    body('reason').isIn(['inaccurate', 'inappropriate', 'spam', 'copyright', 'other']).withMessage('Invalid reason'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Description too long')
  ],
  async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { contentType, contentId, reason, description } = req.body;
    const reporterId = req.user.id;

    // Check if content exists
    const contentTable = contentType === 'dua' ? 'duas' : 'blogs';
    const contentCheck = await pool.query(
      `SELECT id FROM ${contentTable} WHERE id = $1`,
      [contentId]
    );

    if (contentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Check if user already reported this content
    const existingReport = await pool.query(
      'SELECT id FROM content_reports WHERE content_type = $1 AND content_id = $2 AND reporter_id = $3',
      [contentType, contentId, reporterId]
    );

    if (existingReport.rows.length > 0) {
      return res.status(400).json({ error: 'You have already reported this content' });
    }

    // Create report
    const result = await pool.query(
      `INSERT INTO content_reports (content_type, content_id, reporter_id, reason, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [contentType, contentId, reporterId, reason, description]
    );

    res.status(201).json({ 
      message: 'Content reported successfully',
      reportId: result.rows[0].id
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// Get reports (admin only)
router.get('/admin', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const reports = await pool.query(`
      SELECT 
        cr.*,
        u.name as reporter_name,
        u.email as reporter_email,
        CASE 
          WHEN cr.content_type = 'dua' THEN d.title
          WHEN cr.content_type = 'blog' THEN b.title
        END as content_title,
        CASE 
          WHEN cr.content_type = 'dua' THEN d.user_id
          WHEN cr.content_type = 'blog' THEN b.user_id
        END as content_author_id,
        author.name as content_author_name
      FROM content_reports cr
      JOIN users u ON cr.reporter_id = u.id
      LEFT JOIN duas d ON cr.content_type = 'dua' AND cr.content_id = d.id
      LEFT JOIN blogs b ON cr.content_type = 'blog' AND cr.content_id = b.id
      LEFT JOIN users author ON (
        (cr.content_type = 'dua' AND d.user_id = author.id) OR
        (cr.content_type = 'blog' AND b.user_id = author.id)
      )
      WHERE cr.status = $1
      ORDER BY cr.created_at DESC
      LIMIT $2 OFFSET $3
    `, [status, limit, offset]);

    const totalCount = await pool.query(
      'SELECT COUNT(*) FROM content_reports WHERE status = $1',
      [status]
    );

    res.json({
      reports: reports.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalCount.rows[0].count),
        pages: Math.ceil(totalCount.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Update report status (admin only)
router.put('/admin/:reportId', 
  authenticateToken,
  [
    body('status').isIn(['reviewed', 'resolved', 'dismissed']).withMessage('Invalid status'),
    body('adminNotes').optional().isLength({ max: 1000 }).withMessage('Admin notes too long')
  ],
  async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { reportId } = req.params;
    const { status, adminNotes } = req.body;

    const result = await pool.query(
      'UPDATE content_reports SET status = $1, admin_notes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [status, adminNotes, reportId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ 
      message: 'Report updated successfully',
      report: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Get report statistics (admin only)
router.get('/admin/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM content_reports
      GROUP BY status
    `);

    const reasonStats = await pool.query(`
      SELECT 
        reason,
        COUNT(*) as count
      FROM content_reports
      GROUP BY reason
    `);

    res.json({
      statusStats: stats.rows,
      reasonStats: reasonStats.rows
    });
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ error: 'Failed to fetch report statistics' });
  }
});

module.exports = router;
