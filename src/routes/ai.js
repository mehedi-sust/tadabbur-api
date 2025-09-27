const express = require('express');
const aiService = require('../services/aiService');
const gemma3Service = require('../services/gemma3Service');
const { authenticateToken, requireScholar } = require('../middleware/auth');
const pool = require('../database/connection');

const router = express.Router();

// Local fallback analysis when external AI services are unavailable
function generateLocalFallbackAnalysis(contentType, content) {
  const suggestions = [];
  
  // Basic content validation suggestions
  if (content.title && content.title.length < 5) {
    suggestions.push('Consider making the title more descriptive (at least 5 characters)');
  }
  
  if (content.arabic_text && content.arabic_text.length < 10) {
    suggestions.push('Arabic text seems too short. Consider adding more content for better context');
  }
  
  if (content.meaning && content.meaning.length < 20) {
    suggestions.push('Meaning/translation could be more detailed to help users understand better');
  }
  
  if (contentType === 'dua') {
    if (!content.arabic_text) {
      suggestions.push('Arabic text is required for duas');
    }
    if (!content.meaning) {
      suggestions.push('Meaning/translation is important for duas');
    }
  }
  
  if (contentType === 'blog') {
    if (!content.content || content.content.length < 100) {
      suggestions.push('Blog content should be more substantial (at least 100 characters)');
    }
  }
  
  // Default suggestions if no specific issues found
  if (suggestions.length === 0) {
    suggestions.push('Content structure looks good');
    suggestions.push('Consider adding more context or examples if applicable');
  }
  
  return {
    summary: `স্থানীয় যাচাই ব্যবহার করে ${contentType} বিষয়বস্তুর মৌলিক বিশ্লেষণ সম্পন্ন হয়েছে।`,
    corrections: suggestions.map(suggestion => {
      const banglaTranslations = {
        'Consider making the title more descriptive (at least 5 characters)': 'শিরোনামটি আরও বর্ণনামূলক করার কথা বিবেচনা করুন (কমপক্ষে ৫টি অক্ষর)',
        'Arabic text seems too short. Consider adding more content for better context': 'আরবি পাঠ খুব ছোট মনে হচ্ছে। আরও ভালো প্রসঙ্গের জন্য আরও বিষয়বস্তু যোগ করার কথা বিবেচনা করুন',
        'Meaning/translation could be more detailed to help users understand better': 'ব্যবহারকারীদের আরও ভালোভাবে বুঝতে সাহায্য করার জন্য অর্থ/অনুবাদ আরও বিস্তারিত হতে পারে',
        'Arabic text is required for duas': 'দুআর জন্য আরবি পাঠ প্রয়োজন',
        'Meaning/translation is important for duas': 'দুআর জন্য অর্থ/অনুবাদ গুরুত্বপূর্ণ',
        'Blog content should be more substantial (at least 100 characters)': 'ব্লগ বিষয়বস্তু আরও গুরুত্বপূর্ণ হওয়া উচিত (কমপক্ষে ১০০টি অক্ষর)',
        'Content structure looks good': 'বিষয়বস্তুর কাঠামো ভালো',
        'Consider adding more context or examples if applicable': 'প্রযোজ্য হলে আরও প্রসঙ্গ বা উদাহরণ যোগ করার কথা বিবেচনা করুন'
      };
      return banglaTranslations[suggestion] || suggestion;
    }),
    authenticity: 'বিষয়বস্তু সঠিকভাবে ফরম্যাট করা হয়েছে। বিস্তারিত ইসলামী সত্যতা যাচাইয়ের জন্য, বাহ্যিক AI পরিষেবা বর্তমানে অনুপলব্ধ।',
    confidence: 0.6,
    source: 'local_fallback'
  };
}

// Get AI analysis for content
router.get('/analysis/:contentType/:contentId', authenticateToken, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;

    if (!['dua', 'blog', 'question', 'answer'].includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    // Check if user has access to this content
    const hasAccess = await checkContentAccess(contentType, contentId, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get AI analysis from queue
    const result = await pool.query(
      'SELECT status, result, error_message FROM ai_processing_queue WHERE content_type = $1 AND content_id = $2 ORDER BY created_at DESC LIMIT 1',
      [contentType, contentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'AI analysis not found' });
    }

    const analysis = result.rows[0];

    if (analysis.status === 'completed' && analysis.result) {
      res.json({
        status: 'completed',
        analysis: JSON.parse(analysis.result)
      });
    } else if (analysis.status === 'failed') {
      res.json({
        status: 'failed',
        error: analysis.error_message
      });
    } else {
      res.json({
        status: analysis.status,
        message: 'Analysis in progress'
      });
    }
  } catch (error) {
    console.error('Get AI analysis error:', error);
    res.status(500).json({ error: 'Failed to get AI analysis' });
  }
});

// Trigger AI analysis manually (for content owners and scholars)
router.post('/analyze/:contentType/:contentId', authenticateToken, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;

    if (!['dua', 'blog', 'question', 'answer'].includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    // Check if user has access to this content
    const hasAccess = await checkContentAccess(contentType, contentId, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied - you can only analyze your own content' });
    }

    // Add to queue
    await pool.query(
      'INSERT INTO ai_processing_queue (content_type, content_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [contentType, contentId, 'pending']
    );

    res.json({ message: 'AI analysis queued successfully' });
  } catch (error) {
    console.error('Trigger AI analysis error:', error);
    res.status(500).json({ error: 'Failed to trigger AI analysis' });
  }
});

// Analyze content directly without saving (for draft content)
router.post('/analyze-draft', authenticateToken, async (req, res) => {
  try {
    const { contentType, content } = req.body;

    if (!['dua', 'blog', 'question', 'answer'].includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    if (!content || (!content.title && !content.arabic_text)) {
      return res.status(400).json({ error: 'Content is required for analysis' });
    }

    // Try Gemma3 service first, fallback to original AI service, then local fallback
    let analysis;
    try {
      console.log('🚀 Trying Gemma3 service...');
      const gemma3Service = require('../services/gemma3Service');
      analysis = await gemma3Service.generateAnalysis(contentType, content);
      console.log('✅ Gemma3 analysis result:', JSON.stringify(analysis, null, 2));
    } catch (gemma3Error) {
      console.log('🔄 Gemma3 failed, trying original AI service...', gemma3Error.message);
      try {
        const aiService = require('../services/aiService');
        analysis = await aiService.generateAnalysis(contentType, content);
        console.log('✅ AI service analysis result:', JSON.stringify(analysis, null, 2));
      } catch (aiError) {
        console.log('🔄 Both external AI services failed, using local fallback...', aiError.message);
        analysis = generateLocalFallbackAnalysis(contentType, content);
        console.log('✅ Local fallback analysis result:', JSON.stringify(analysis, null, 2));
      }
    }

    res.json({ 
      status: 'completed',
      analysis: analysis
    });
  } catch (error) {
    console.error('Draft AI analysis error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze draft content' });
  }
});

// Get queue status (for admins)
router.get('/queue/status', authenticateToken, requireScholar, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT content_type, status, COUNT(*) as count
      FROM ai_processing_queue
      GROUP BY content_type, status
      ORDER BY content_type, status
    `);

    const status = {};
    result.rows.forEach(row => {
      if (!status[row.content_type]) {
        status[row.content_type] = {};
      }
      status[row.content_type][row.status] = parseInt(row.count);
    });

    // Get Gemma3 queue status
    const gemma3Status = gemma3Service.getQueueStatus();

    res.json({ 
      queue_status: status,
      gemma3_queue: gemma3Status
    });
  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

// Helper function to check content access
async function checkContentAccess(contentType, contentId, userId) {
  
  let query;
  switch (contentType) {
    case 'dua':
      query = 'SELECT user_id, is_public FROM duas WHERE id = $1';
      break;
    case 'blog':
      query = 'SELECT author_id as user_id, is_published as is_public FROM blogs WHERE id = $1';
      break;
    case 'question':
      query = 'SELECT user_id, is_public FROM questions WHERE id = $1';
      break;
    case 'answer':
      query = 'SELECT scholar_id as user_id FROM answers WHERE id = $1';
      break;
    default:
      return false;
  }

  const result = await pool.query(query, [contentId]);
  if (result.rows.length === 0) {
    return false;
  }

  const content = result.rows[0];
  
  // User owns the content or content is public
  return content.user_id === userId || content.is_public;
}

module.exports = router;
