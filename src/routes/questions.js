const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken, requireScholar } = require('../middleware/auth');

const router = express.Router();

// Get all public questions with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const tag = req.query.tag || '';
    const answered = req.query.answered;

    let query = `
      SELECT q.*, u.name as author_name,
             COUNT(a.id) as answer_count
      FROM questions q
      LEFT JOIN users u ON q.user_id = u.id
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.is_public = true
    `;
    
    const queryParams = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (q.title ILIKE $${paramCount} OR q.content ILIKE $${paramCount})`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    if (tag) {
      query += ` AND $${paramCount} = ANY(q.tags)`;
      queryParams.push(tag);
      paramCount++;
    }

    if (answered !== undefined) {
      query += ` AND q.is_answered = $${paramCount}`;
      queryParams.push(answered === 'true');
      paramCount++;
    }

    query += ` GROUP BY q.id, u.name ORDER BY q.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM questions q
      WHERE q.is_public = true
    `;
    
    const countParams = [];
    paramCount = 1;

    if (search) {
      countQuery += ` AND (q.title ILIKE $${paramCount} OR q.content ILIKE $${paramCount})`;
      countParams.push(`%${search}%`);
      paramCount++;
    }

    if (tag) {
      countQuery += ` AND $${paramCount} = ANY(q.tags)`;
      countParams.push(tag);
      paramCount++;
    }

    if (answered !== undefined) {
      countQuery += ` AND q.is_answered = $${paramCount}`;
      countParams.push(answered === 'true');
      paramCount++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      questions: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// Get single question with answers
router.get('/:id', async (req, res) => {
  try {
    const questionResult = await pool.query(`
      SELECT q.*, u.name as author_name
      FROM questions q
      LEFT JOIN users u ON q.user_id = u.id
      WHERE q.id = $1 AND (q.is_public = true OR q.user_id = $2)
    `, [req.params.id, req.user?.id]);

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = questionResult.rows[0];

    // Get answers
    const answersResult = await pool.query(`
      SELECT a.*, u.name as scholar_name
      FROM answers a
      LEFT JOIN users u ON a.scholar_id = u.id
      WHERE a.question_id = $1
      ORDER BY a.created_at ASC
    `, [req.params.id]);

    res.json({
      question,
      answers: answersResult.rows
    });
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

// Get user's own questions
router.get('/my-questions', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT q.*, COUNT(a.id) as answer_count
      FROM questions q
      LEFT JOIN answers a ON q.id = a.question_id
      WHERE q.user_id = $1
      GROUP BY q.id
      ORDER BY q.created_at DESC 
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);

    const countResult = await pool.query('SELECT COUNT(*) as total FROM questions WHERE user_id = $1', [req.user.id]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      questions: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get my questions error:', error);
    res.status(500).json({ error: 'Failed to fetch your questions' });
  }
});

// Create new question
router.post('/', authenticateToken, [
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required and must be 1-500 characters'),
  body('content').trim().isLength({ min: 50 }).withMessage('Content must be at least 50 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('is_public').optional().isBoolean().withMessage('is_public must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, tags = [], is_public = true } = req.body;

    const result = await pool.query(`
      INSERT INTO questions (user_id, title, content, tags, is_public)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [req.user.id, title, content, tags, is_public]);

    const question = result.rows[0];

    // Queue for AI processing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('question', $1, 'pending')
    `, [question.id]);

    res.status(201).json({
      message: 'Question created successfully',
      question
    });
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// Update question
router.put('/:id', authenticateToken, [
  body('title').optional().trim().isLength({ min: 1, max: 500 }).withMessage('Title must be 1-500 characters'),
  body('content').optional().trim().isLength({ min: 50 }).withMessage('Content must be at least 50 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('is_public').optional().isBoolean().withMessage('is_public must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if question exists and user owns it
    const existingQuestion = await pool.query('SELECT * FROM questions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (existingQuestion.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }

    const { title, content, tags, is_public } = req.body;

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
    if (tags !== undefined) {
      updates.push(`tags = $${paramCount}`);
      values.push(tags);
      paramCount++;
    }
    if (is_public !== undefined) {
      updates.push(`is_public = $${paramCount}`);
      values.push(is_public);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE questions SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    // Queue for AI reprocessing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('question', $1, 'pending')
    `, [req.params.id]);

    res.json({
      message: 'Question updated successfully',
      question: result.rows[0]
    });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Delete question
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM questions WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// Answer a question (scholars only)
router.post('/:id/answer', authenticateToken, requireScholar, [
  body('content').trim().isLength({ min: 50 }).withMessage('Answer must be at least 50 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content } = req.body;
    const questionId = req.params.id;

    // Check if question exists and is public
    const questionResult = await pool.query('SELECT id FROM questions WHERE id = $1 AND is_public = true', [questionId]);
    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Create answer
    const answerResult = await pool.query(`
      INSERT INTO answers (question_id, scholar_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [questionId, req.user.id, content]);

    const answer = answerResult.rows[0];

    // Mark question as answered
    await pool.query('UPDATE questions SET is_answered = true WHERE id = $1', [questionId]);

    // Queue for AI processing
    await pool.query(`
      INSERT INTO ai_processing_queue (content_type, content_id, status)
      VALUES ('answer', $1, 'pending')
    `, [answer.id]);

    res.status(201).json({
      message: 'Answer created successfully',
      answer
    });
  } catch (error) {
    console.error('Create answer error:', error);
    res.status(500).json({ error: 'Failed to create answer' });
  }
});

// Verify answer (scholars only)
router.post('/answers/:answerId/verify', authenticateToken, requireScholar, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE answers 
      SET is_verified = true, verified_by = $1, verified_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [req.user.id, req.params.answerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Answer not found' });
    }

    res.json({
      message: 'Answer verified successfully',
      answer: result.rows[0]
    });
  } catch (error) {
    console.error('Verify answer error:', error);
    res.status(500).json({ error: 'Failed to verify answer' });
  }
});

// Get popular tags
router.get('/tags/popular', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT unnest(tags) as tag, COUNT(*) as count
      FROM questions
      WHERE is_public = true AND tags IS NOT NULL
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
