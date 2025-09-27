# Gemma 3 27B Integration Guide

## Overview

The MyDua backend now uses Google's **Gemma 3 27B** model via Hugging Face Inference API for advanced Islamic content analysis. This large language model provides superior understanding and analysis capabilities compared to smaller models.

## Model Specifications

- **Model**: `google/gemma-3-27b-it`
- **Parameters**: 27 billion
- **Context Window**: 128K tokens
- **Languages**: Multilingual (140+ languages)
- **Specialization**: Instruction-tuned for better task following

## Configuration

### Environment Variables

```env
# Hugging Face AI Configuration (Gemma 3 27B)
HF_TOKEN=your-hugging-face-token-here
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-27b-it
```

### API Parameters

The AI service is optimized for the Gemma 3 27B model with the following parameters:

```javascript
{
  max_new_tokens: 800,        // Increased for detailed analysis
  temperature: 0.6,           // Balanced creativity and accuracy
  top_p: 0.9,                 // Nucleus sampling for quality
  top_k: 50,                  // Top-k sampling
  repetition_penalty: 1.1,    // Reduce repetition
  do_sample: true,            // Enable sampling
  return_full_text: false     // Return only generated text
}
```

## Features

### 1. Content Analysis
- **Duas**: Islamic prayer analysis and authenticity verification
- **Blogs**: Islamic article quality assessment
- **Questions**: Q&A content evaluation
- **Answers**: Answer quality and accuracy verification

### 2. AI Capabilities
- **Islamic Authenticity**: Verify content authenticity against Islamic principles
- **Quality Assessment**: Provide suggestions for improvement
- **Summary Generation**: Create concise summaries of content
- **Error Detection**: Identify grammatical and factual errors
- **Source Verification**: Validate source references

### 3. Structured Output
The AI provides structured analysis with three main components:

```json
{
  "summary": "Concise 2-3 sentence summary of the content",
  "corrections": "Islamic authenticity issues, grammatical errors, or suggestions",
  "authenticity": "Assessment of Islamic authenticity and credibility"
}
```

## Performance Considerations

### 1. Processing Time
- **Cold Start**: 10-30 seconds (model loading)
- **Warm Model**: 5-15 seconds per request
- **Queue System**: Asynchronous processing to handle load

### 2. Resource Requirements
- **Memory**: ~20GB VRAM (handled by Hugging Face)
- **API Limits**: Respect Hugging Face rate limits
- **Timeout**: 60 seconds per request

### 3. Cost Optimization
- **Queue Management**: Batch processing to reduce API calls
- **Caching**: Store results to avoid re-analysis
- **Error Handling**: Graceful fallback for failed requests

## Usage Examples

### Trigger AI Analysis

```bash
# Trigger analysis for a dua
POST /api/ai/analyze/dua/{dua_id}
Authorization: Bearer <token>

# Response
{
  "message": "AI analysis queued successfully"
}
```

### Get Analysis Results

```bash
# Get analysis results
GET /api/ai/analysis/dua/{dua_id}
Authorization: Bearer <token>

# Response
{
  "status": "completed",
  "analysis": {
    "summary": "This dua appears to be authentic and well-sourced...",
    "corrections": "Consider adding more context about when to recite this dua...",
    "authenticity": "The content appears to be Islamic in nature and properly referenced."
  }
}
```

### Monitor Queue Status

```bash
# Get queue status (scholars+ only)
GET /api/ai/queue/status
Authorization: Bearer <token>

# Response
{
  "queue_status": {
    "dua": {
      "pending": 5,
      "processing": 2,
      "completed": 100,
      "failed": 3
    }
  }
}
```

## Testing

### Run AI Tests

```bash
# Test AI integration
npm run test:ai

# Test all endpoints
npm test
```

### Test Coverage

- AI service configuration
- Model parameter validation
- Queue system functionality
- Error handling and fallbacks
- Response parsing and formatting

## Monitoring and Maintenance

### 1. Health Checks
- Monitor API response times
- Track success/failure rates
- Monitor queue processing times

### 2. Error Handling
- Graceful degradation on API failures
- Retry logic for transient errors
- Fallback responses for critical failures

### 3. Performance Optimization
- Cache frequently analyzed content
- Optimize prompt engineering
- Monitor and adjust parameters

## Troubleshooting

### Common Issues

1. **Model Loading Timeout**
   - Solution: Increase timeout in AI service
   - Check Hugging Face API status

2. **Rate Limiting**
   - Solution: Implement exponential backoff
   - Monitor API usage patterns

3. **Memory Issues**
   - Solution: Use Hugging Face's managed inference
   - Consider model quantization if needed

### Debug Commands

```bash
# Check AI service status
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/ai/queue/status

# Test AI analysis
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/ai/analyze/dua/{dua_id}
```

## Future Enhancements

1. **Model Fine-tuning**: Custom training on Islamic content
2. **Multi-model Support**: Fallback to smaller models
3. **Real-time Analysis**: WebSocket support for live analysis
4. **Batch Processing**: Bulk analysis capabilities
5. **Custom Prompts**: User-defined analysis criteria

## Support

For technical support regarding the Gemma 2 27B integration:
- Check Hugging Face documentation
- Monitor API status and limits
- Review error logs and queue status
- Contact development team for advanced issues
