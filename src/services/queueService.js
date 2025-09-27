const Queue = require('bull');
const aiService = require('./aiService');
const gemma3Service = require('./gemma3Service');
const pool = require('../database/connection');

class QueueService {
  constructor() {
    // Check if Redis is available (graceful fallback for Vercel without Docker)
    this.hasRedis = !!process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379';
    this.isQueueEnabled = !!(this.hasRedis || process.env.REDIS_URL === 'inline');
    
    if (this.isQueueEnabled && this.hasRedis) {
      try {
        this.aiQueue = new Queue('AI Processing', process.env.REDIS_URL || 'redis://localhost:6379');
        this.setupProcessors();
        console.log('✅ Redis queue initialized');
      } catch (error) {
        console.log('⚠️  Redis unavailable, using inline processing');
        this.aiQueue = null;
        this.isQueueEnabled = false;
      }
    } else {
      this.aiQueue = null;
      console.log('ℹ️  Redis disabled for this deployment (inline processing)');
    }
  }

  setupProcessors() {
    if (!this.aiQueue) return;
    
    // Process AI analysis jobs
    this.aiQueue.process('analyze-content', async (job) => {
      const { contentType, contentId } = job.data;
      return await gemma3Service.processContent(contentType, contentId);
    });

    // Handle job completion
    this.aiQueue.on('completed', (job, result) => {
      console.log(`AI analysis completed for ${job.data.contentType}:${job.data.contentId}`);
    });

    // Handle job failure
    this.aiQueue.on('failed', (job, err) => {
      console.error(`AI analysis failed for ${job.data.contentType}:${job.data.contentId}`, err);
    });
  }

  async addAIAnalysisJob(contentType, contentId, priority = 'normal') {
    // If no Redis queue available, use inline processing
    if (!this.aiQueue || !this.isQueueEnabled) {
      console.log('🔄 Using inline AI analysis processing (Redis not available)');
      try {
        await pool.query(
          'UPDATE ai_processing_queue SET status = $1 WHERE content_id = $2 AND content_type = $3',
          ['processing', contentId, contentType]
        );
        
        const result = await gemma3Service.processContent(contentType, contentId);
        
        await pool.query(
          'UPDATE ai_processing_queue SET status = $1, result = $2, processed_at = CURRENT_TIMESTAMP WHERE content_id = $3 AND content_type = $4',
          ['completed', JSON.stringify(result), contentId, contentType]
        );
        
        return { success: true, result };
      } catch (error) {
        console.error('Inline AI analysis failed:', error);
        await pool.query(
          'UPDATE ai_processing_queue SET status = $1, error_message = $2, processed_at = CURRENT_TIMESTAMP WHERE content_id = $3 AND content_type = $4',
          ['failed', error.message, contentId, contentType]
        );
        throw error;
      }
    }
    
    const jobOptions = {
      priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
    };

    return await this.aiQueue.add('analyze-content', {
      contentType,
      contentId
    }, jobOptions);
  }

  async getQueueStats() {
    // If using inline processing, get stats from database
    if (!this.aiQueue || !this.isQueueEnabled) {
      try {
        const result = await pool.query(`
          SELECT 
            status,
            COUNT(*) as count
          FROM ai_processing_queue 
          GROUP BY status
        `);
        
        const stats = {
          queued: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          total: 0
        };
        
        result.rows.forEach(row => {
          const count = parseInt(row.count);
          stats[row.status] = count;
          stats.total += count;
        });
        
        return stats;
      } catch (error) {
        console.error('Error getting inline queue stats:', error);
        return { queued: 0, processing: 0, completed: 0, failed: 0, total: 0 };
      }
    }
    
    const waiting = await this.aiQueue.getWaiting();
    const active = await this.aiQueue.getActive();
    const completed = await this.aiQueue.getCompleted();
    const failed = await this.aiQueue.getFailed();

    return {
      queued: waiting.length,
      processing: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    };
  }

  async clearQueue() {
    if (!this.aiQueue) {
      try {
        await pool.query('DELETE FROM ai_processing_queue');
        return;
      } catch (error) {
        console.error('Error clearing inline queue:', error);
        return;
      }
    }
    await this.aiQueue.empty();
  }

  async pauseQueue() {
    if (!this.aiQueue) return;
    await this.aiQueue.pause();
  }

  async resumeQueue() {
    if (!this.aiQueue) return;
    await this.aiQueue.resume();
  }
}

module.exports = new QueueService();
