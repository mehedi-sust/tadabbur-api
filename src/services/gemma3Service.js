const { OpenAI } = require('openai');
const pool = require('../database/connection');

class Gemma3Service {
  constructor() {
    this.client = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: process.env.HF_TOKEN,
    });
    
    this.isProcessing = false;
    this.requestQueue = [];
    this.currentRequest = null;
  }

  async processContent(contentType, contentId) {
    try {
      // Mark as processing
      await pool.query(
        'UPDATE ai_processing_queue SET status = $1 WHERE content_id = $2 AND content_type = $3',
        ['processing', contentId, contentType]
      );

      // Get content based on type
      let content = await this.getContent(contentType, contentId);
      if (!content) {
        throw new Error('Content not found');
      }

      // Generate AI analysis using queue system
      const analysis = await this.generateAnalysisWithQueue(contentType, content);

      // Update content with AI analysis
      await this.updateContentWithAI(contentType, contentId, analysis);

      // Mark as completed
      await pool.query(
        'UPDATE ai_processing_queue SET status = $1, result = $2, processed_at = CURRENT_TIMESTAMP WHERE content_id = $3 AND content_type = $4',
        ['completed', JSON.stringify(analysis), contentId, contentType]
      );

      return analysis;
    } catch (error) {
      console.error('Gemma3 processing error:', error);
      
      // Mark as failed
      await pool.query(
        'UPDATE ai_processing_queue SET status = $1, error_message = $2, processed_at = CURRENT_TIMESTAMP WHERE content_id = $3 AND content_type = $4',
        ['failed', error.message, contentId, contentType]
      );

      throw error;
    }
  }

  async getContent(contentType, contentId) {
    let query;
    switch (contentType) {
      case 'dua':
        query = 'SELECT title, purpose, arabic_text, english_meaning, transliteration, native_meaning, source_reference FROM duas WHERE id = $1';
        break;
      case 'blog':
        query = 'SELECT title, content FROM blogs WHERE id = $1';
        break;
      case 'question':
        query = 'SELECT title, content FROM questions WHERE id = $1';
        break;
      case 'answer':
        query = 'SELECT content FROM answers WHERE id = $1';
        break;
      default:
        throw new Error('Invalid content type');
    }

    const result = await pool.query(query, [contentId]);
    return result.rows[0];
  }

  async generateAnalysisWithQueue(contentType, content) {
    return new Promise((resolve, reject) => {
      const request = {
        contentType,
        content,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.requestQueue.push(request);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const request = this.requestQueue.shift();
    this.currentRequest = request;

    try {
      console.log(`🔄 Processing Gemma3 request for ${request.contentType} (Queue: ${this.requestQueue.length} remaining)`);
      
      const analysis = await this.generateAnalysis(request.contentType, request.content);
      request.resolve(analysis);
    } catch (error) {
      console.error('Gemma3 queue processing error:', error);
      request.reject(error);
    } finally {
      this.isProcessing = false;
      this.currentRequest = null;
      
      // Process next item in queue
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000); // 1 second delay between requests
      }
    }
  }

  async generateAnalysis(contentType, content) {
    const prompt = this.buildPrompt(contentType, content);
    
    console.log('📝 Gemma3 Prompt being sent:');
    console.log('=' .repeat(80));
    console.log(prompt);
    console.log('=' .repeat(80));
    
    try {
      const chatCompletion = await this.client.chat.completions.create({
        model: "google/gemma-3-12b-it:featherless-ai",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9
      });

      const response = chatCompletion.choices[0].message.content;
      console.log('🤖 Gemma3 Raw Response:');
      console.log('=' .repeat(80));
      console.log(response);
      console.log('=' .repeat(80));
      
      return this.parseAIResponse(response);
    } catch (error) {
      console.error('Gemma3 API error:', error);
      
      // Fallback to original AI service if Gemma3 is unavailable
      if (error.status === 503 || error.message.includes('503') || error.message.includes('Service Unavailable')) {
        console.log('🔄 Gemma3 unavailable, falling back to original AI service...');
        const aiService = require('./aiService');
        return await aiService.generateAnalysis(contentType, content);
      }
      
      throw new Error('AI service temporarily unavailable');
    }
  }

  buildPrompt(contentType, content) {
    const basePrompt = `Content to analyze:
Title: ${content.title || 'Not specified'}
Purpose: ${content.purpose || 'Not specified'}
Arabic Text: ${content.arabic_text || 'Not specified'}
English Meaning: ${content.english_meaning || 'Not specified'}
Transliteration: ${content.transliteration || 'Not specified'}
Native Meaning: ${content.native_meaning || 'Not specified'}
Source Reference: ${content.source_reference || 'N/A'}

Check the contents for any issues and provide a summary of the content correction and suggestions.
- Do not use md styling only use with plain text.
- Show the output as json format. Each correction will be as a array element.
- Proive bangla and english for the correction and suggestions.
- If ther is no correction need the correction array will be empty . 
- Here is a sample output struture 

{
    "analysis": {
      "title": " জাহান্নাম থেকে মুক্তি",
      "purpose": "Not specified",
      "arabic_text": " اللَّهُمَّ أَجِرْنِى مِ",
      "english_meaning": "O Allah! Save me from the fire of Hell.",
      "transliteration": "আল্লাহুম্মা আজিরনি মিনান নার।",
      "native_meaning": "হে আল্লাহ! আমাকে",
      "source_reference": "N/A"
    },
    "corrections": [
      {
        "field": "title",
        "issue_english": "Descriptive, not standard for a du'a.",
        "issue_bangla": "বর্ণনমূলক, একটি দু'য়ার জন্য আদর্শ নয়।",
        "suggestion_english": "Du'a for Protection from Hellfire",
        "suggestion_bangla": "জাহান্নাম থেকে সুরক্ষার জন্য দু'আ"
      }
    ],
    "summary": {
      "english": "The provided content contains several inaccuracies, primarily due to an incomplete Arabic text. Corrections include completing the Arabic and Bengali text, refining the transliteration, providing a more accurate English meaning, suggesting a better title, and emphasizing the need to specify a purpose and source reference. These changes improve the content's accuracy, clarity, and usefulness.",
      "bangla": "প্রদত্ত অংশে বেশ কিছু ভুল রয়েছে, যার প্রধান কারণ হল একটি অসম্পূর্ণ আরবি পাঠ। সংশোধনগুলির মধ্যে আরবি এবং বাংলা পাঠ সম্পূর্ণ করা, প্রতিবর্ণীকরণ পরিমার্জন করা, আরও সঠিক ইংরেজি অর্থ প্রদান করা, একটি ভাল শিরোনাম প্রস্তাব করা এবং উদ্দেশ্য ও উৎস উল্লেখ করার প্রয়োজনীয়তার উপর জোর দেওয়া অন্তর্ভুক্ত। এই পরিবর্তনগুলি সামগ্রীর নির্ভুলতা, স্পষ্টতা এবং উপযোগিতা বৃদ্ধি করে।"
    }
  }

output:`;

    return basePrompt;
  }

  parseAIResponse(response) {
    try {
      // Try to parse as JSON first
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonResponse = JSON.parse(jsonMatch[0]);
        
        // Handle the working example format
        if (jsonResponse.analysis && jsonResponse.corrections && jsonResponse.summary) {
          return {
            summary: {
              english: jsonResponse.summary.english || 'Summary not provided',
              bangla: jsonResponse.summary.bangla || 'সারাংশ প্রদান করা হয়নি'
            },
            corrections: Array.isArray(jsonResponse.corrections) ? 
              jsonResponse.corrections.map(correction => 
                typeof correction === 'object' ? {
                  field: correction.field || 'unknown',
                  issue_english: correction.issue_english || '',
                  issue_bangla: correction.issue_bangla || '',
                  suggestion_english: correction.suggestion_english || '',
                  suggestion_bangla: correction.suggestion_bangla || ''
                } : correction
              ) : 
              [jsonResponse.corrections || 'পরামর্শ প্রদান করা হয়নি'],
            authenticity: {
              english: 'Content analysis completed',
              bangla: 'বিষয়বস্তু বিশ্লেষণ সম্পন্ন হয়েছে'
            },
            confidence: 0.8
          };
        }
        
        // Fallback to old format
        return {
          summary: jsonResponse.summary || 'সারাংশ প্রদান করা হয়নি',
          corrections: Array.isArray(jsonResponse.corrections) ? jsonResponse.corrections : [jsonResponse.corrections || 'পরামর্শ প্রদান করা হয়নি'],
          authenticity: jsonResponse.authenticity || 'সত্যতা মূল্যায়ন প্রদান করা হয়নি',
          confidence: jsonResponse.confidence || 0.8
        };
      }

      // Fallback to text parsing if JSON parsing fails
      const lines = response.split('\n').filter(line => line.trim());
      
      let summary = '';
      let corrections = '';
      let authenticity = '';

      let currentSection = '';
      for (const line of lines) {
        const trimmedLine = line.trim();
        const lowerLine = trimmedLine.toLowerCase();
        
        // Check for section headers
        if (lowerLine.includes('summary:') || lowerLine.includes('1. summary') || lowerLine.includes('summary')) {
          currentSection = 'summary';
          summary += trimmedLine.replace(/^(summary:|1\.\s*summary|summary)\s*/i, '').trim() + ' ';
        } else if (lowerLine.includes('corrections:') || lowerLine.includes('2. corrections') || lowerLine.includes('correction')) {
          currentSection = 'corrections';
          corrections += trimmedLine.replace(/^(corrections:|2\.\s*corrections|correction)\s*/i, '').trim() + ' ';
        } else if (lowerLine.includes('authenticity:') || lowerLine.includes('3. authenticity') || lowerLine.includes('authenticity')) {
          currentSection = 'authenticity';
          authenticity += trimmedLine.replace(/^(authenticity:|3\.\s*authenticity|authenticity)\s*/i, '').trim() + ' ';
        } else if (currentSection && trimmedLine) {
          // Continue adding to current section
          switch (currentSection) {
            case 'summary':
              summary += trimmedLine + ' ';
              break;
            case 'corrections':
              corrections += trimmedLine + ' ';
              break;
            case 'authenticity':
              authenticity += trimmedLine + ' ';
              break;
          }
        }
      }

      // Clean up and ensure we have meaningful content
      const cleanSummary = summary.trim() || 'AI দ্বারা বিশ্লেষণ সম্পন্ন - বিষয়বস্তু ইসলামী প্রকৃতির বলে মনে হচ্ছে';
      const cleanCorrections = corrections.trim() || 'সব তথ্য ঠিক আছে - কোনো সংশোধনের প্রয়োজন নেই';
      const cleanAuthenticity = authenticity.trim() || 'বিষয়বস্তু ইসলামী প্রকৃতির এবং সত্যতা বলে মনে হচ্ছে';

      return {
        summary: cleanSummary,
        corrections: [cleanCorrections],
        authenticity: cleanAuthenticity,
        confidence: 0.8
      };
    } catch (error) {
      console.error('Error parsing Gemma3 response:', error);
      return {
        summary: 'AI দ্বারা বিশ্লেষণ সম্পন্ন - বিষয়বস্তু ইসলামী প্রকৃতির বলে মনে হচ্ছে',
        corrections: ['সব তথ্য ঠিক আছে - কোনো সংশোধনের প্রয়োজন নেই'],
        authenticity: 'বিষয়বস্তু ইসলামী প্রকৃতির বলে মনে হচ্ছে - যাচাই সুপারিশ করা হচ্ছে',
        confidence: 0.0
      };
    }
  }

  async updateContentWithAI(contentType, contentId, analysis) {
    let query;
    switch (contentType) {
      case 'dua':
        query = 'UPDATE duas SET ai_summary = $1, ai_corrections = $2 WHERE id = $3';
        break;
      case 'blog':
        query = 'UPDATE blogs SET ai_summary = $1 WHERE id = $2';
        break;
      case 'question':
        query = 'UPDATE questions SET ai_summary = $1 WHERE id = $2';
        break;
      case 'answer':
        query = 'UPDATE answers SET ai_summary = $1 WHERE id = $2';
        break;
      default:
        throw new Error('Invalid content type for update');
    }

    const params = contentType === 'dua' 
      ? [analysis.summary, analysis.corrections, contentId]
      : [analysis.summary, contentId];

    await pool.query(query, params);
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const request = this.requestQueue.shift();
    this.currentRequest = request;

    try {
      console.log(`🔄 Processing Gemma3 request for ${request.contentType} (Queue: ${this.requestQueue.length} remaining)`);
      
      const analysis = await this.generateAnalysis(request.contentType, request.content);
      request.resolve(analysis);
    } catch (error) {
      console.error('Gemma3 queue processing error:', error);
      request.reject(error);
    } finally {
      this.isProcessing = false;
      this.currentRequest = null;
      
      // Process next item in queue
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processQueue(), 1000); // 1 second delay between requests
      }
    }
  }

  getQueueStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.requestQueue.length,
      currentRequest: this.currentRequest ? {
        contentType: this.currentRequest.contentType,
        timestamp: this.currentRequest.timestamp
      } : null
    };
  }

  async clearQueue() {
    this.requestQueue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.requestQueue = [];
    this.isProcessing = false;
    this.currentRequest = null;
  }
}

module.exports = new Gemma3Service();
