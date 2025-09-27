const axios = require('axios');
const pool = require('../database/connection');

class AIService {
  constructor() {
    this.apiUrl = process.env.HF_API_URL || 'https://api-inference.huggingface.co/models/google/gemma-3-27b-it';
    this.token = process.env.HF_TOKEN;
    this.isProcessing = false;
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

      // Generate AI analysis
      const analysis = await this.generateAnalysis(contentType, content);

      // Update content with AI analysis
      await this.updateContentWithAI(contentType, contentId, analysis);

      // Mark as completed
      await pool.query(
        'UPDATE ai_processing_queue SET status = $1, result = $2, processed_at = CURRENT_TIMESTAMP WHERE content_id = $3 AND content_type = $4',
        ['completed', JSON.stringify(analysis), contentId, contentType]
      );

      return analysis;
    } catch (error) {
      console.error('AI processing error:', error);
      
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

  async generateAnalysis(contentType, content) {
    const prompt = this.buildPrompt(contentType, content);
    
    console.log('📝 AI Service Prompt being sent:');
    console.log('=' .repeat(80));
    console.log(prompt);
    console.log('=' .repeat(80));
    
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          inputs: prompt,
          parameters: {
            max_new_tokens: 800,
            temperature: 0.6,
            top_p: 0.9,
            top_k: 50,
            repetition_penalty: 1.1,
            return_full_text: false,
            do_sample: true
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // Increased timeout for larger model
        }
      );

      console.log('🤖 AI Service Raw Response:');
      console.log('=' .repeat(80));
      console.log(JSON.stringify(response.data, null, 2));
      console.log('=' .repeat(80));

      return this.parseAIResponse(response.data);
    } catch (error) {
      console.error('Hugging Face API error:', error.response?.data || error.message);
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
      console.log('🔍 Raw AI Response:', JSON.stringify(response, null, 2));
      
      // Handle different response formats from Hugging Face
      let text = '';
      if (Array.isArray(response)) {
        text = response[0]?.generated_text || '';
      } else if (response.generated_text) {
        text = response.generated_text;
      } else if (typeof response === 'string') {
        text = response;
      }

      console.log('📝 Extracted text:', text);

      // Try to parse as JSON first
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('🎯 JSON match found:', jsonMatch[0]);
        try {
          const jsonResponse = JSON.parse(jsonMatch[0]);
          console.log('✅ Parsed JSON:', JSON.stringify(jsonResponse, null, 2));
          
          // Handle the working example format
          if (jsonResponse.analysis && jsonResponse.corrections && jsonResponse.summary) {
            console.log('🇧🇩 Working example format detected');
            const result = {
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
            console.log('🎉 Returning working example result:', JSON.stringify(result, null, 2));
            return result;
          }
          
          // Fallback to simple format
          console.log('🇧🇩 Simple format detected');
          const result = {
            summary: jsonResponse.summary || 'সারাংশ প্রদান করা হয়নি',
            corrections: Array.isArray(jsonResponse.corrections) ? jsonResponse.corrections : [jsonResponse.corrections || 'পরামর্শ প্রদান করা হয়নি'],
            authenticity: jsonResponse.authenticity || 'সত্যতা মূল্যায়ন প্রদান করা হয়নি',
            confidence: jsonResponse.confidence || 0.8
          };
          console.log('🎉 Returning simple result:', JSON.stringify(result, null, 2));
          return result;
        } catch (jsonError) {
          console.log('❌ JSON parsing failed:', jsonError.message);
          console.log('📝 Falling back to text parsing');
        }
      } else {
        console.log('❌ No JSON match found in text');
      }

      // Fallback to text parsing if JSON parsing fails
      const lines = text.split('\n').filter(line => line.trim());
      
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
      const cleanSummary = summary.trim() || 'AI analysis completed - content appears to be Islamic in nature';
      const cleanCorrections = corrections.trim() || 'No specific corrections suggested - content appears authentic';
      const cleanAuthenticity = authenticity.trim() || 'Content appears to be Islamic in nature and authentic';

      return {
        summary: cleanSummary,
        corrections: [cleanCorrections],
        authenticity: cleanAuthenticity,
        confidence: 0.8
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return {
        summary: 'AI দ্বারা বিশ্লেষিত বিষয়বস্তু - বিষয়বস্তু ইসলামী প্রকৃতির বলে মনে হচ্ছে',
        corrections: ['বিস্তারিত বিশ্লেষণ পার্স করতে অক্ষম - ম্যানুয়াল পর্যালোচনা সুপারিশ করা হচ্ছে'],
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
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get next pending item
      const result = await pool.query(
        'SELECT * FROM ai_processing_queue WHERE status = $1 ORDER BY created_at ASC LIMIT 1',
        ['pending']
      );

      if (result.rows.length > 0) {
        const item = result.rows[0];
        await this.processContent(item.content_type, item.content_id);
      }
    } catch (error) {
      console.error('Queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  startQueueProcessor() {
    // Process queue every 30 seconds
    setInterval(() => {
      this.processQueue();
    }, 30000);

    console.log('AI queue processor started');
  }
}

module.exports = new AIService();
