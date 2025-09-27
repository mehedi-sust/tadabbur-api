# MyDua API Documentation

## Overview

The MyDua API is a comprehensive REST API for managing Islamic content including duas, blogs, Q&A, and user management. It provides authentication, role-based access control, AI-powered content analysis using Google's Gemma 3 27B model, and expert verification systems.

## Base URL

```
Production: https://mydua-backend.vercel.app/api
Development: http://localhost:3001/api
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Response Format

### Success Response
```json
{
  "message": "Operation successful",
  "data": { ... },
  "pagination": { ... } // For paginated endpoints
}
```

### Error Response
```json
{
  "error": "Error message",
  "errors": [ ... ] // For validation errors
}
```

## Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

## Rate Limiting

- 100 requests per 15 minutes per IP
- Rate limit headers included in response

---

## AI Integration

The API uses Google's Gemma 3 27B model via Hugging Face Inference API for:

- **Content Analysis**: Automatic analysis of duas, blogs, questions, and answers
- **Islamic Authenticity**: Verification of Islamic content authenticity
- **Quality Assessment**: Suggestions for improvement and corrections
- **Summary Generation**: AI-powered summaries of content

### AI Model Configuration

```env
HF_TOKEN=your-hugging-face-token-here
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-27b-it
```

### AI Processing Queue

AI analysis is processed asynchronously through a queue system to handle the computational requirements of the 27B parameter model:

- **Queue Status**: Monitor processing status via `/api/ai/queue/status`
- **Analysis Results**: Retrieve results via `/api/ai/analysis/:contentType/:contentId`
- **Manual Trigger**: Force analysis via `/api/ai/analyze/:contentType/:contentId`

---

## Authentication Endpoints

### Register User

**POST** `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "native_language": "english"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "native_language": "english"
  },
  "token": "jwt-token"
}
```

### Login User

**POST** `/auth/login`

Authenticate user and return JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "native_language": "english"
  },
  "token": "jwt-token"
}
```

### Get User Profile

**GET** `/auth/profile`

Get current user's profile information.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "native_language": "english",
    "theme": "light",
    "language": "english",
    "dua_view_mode": "grid",
    "notifications_enabled": true
  }
}
```

---

## Dua Endpoints

### Get Public Duas

**GET** `/duas`

Get paginated list of public duas with optional filters.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `search` (optional): Search term
- `category` (optional): Category filter
- `verified` (optional): Filter by verification status (true/false)

**Response:**
```json
{
  "duas": [
    {
      "id": "uuid",
      "title": "Dua for Success",
      "purpose": "A dua for seeking success",
      "arabic_text": "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
      "english_meaning": "In the name of Allah",
      "transliteration": "Bismillah ir-Rahman ir-Raheem",
      "native_meaning": "In the name of Allah",
      "source_reference": "Quran 1:1",
      "is_public": true,
      "is_verified": true,
      "verified_by": "scholar-uuid",
      "verified_at": "2024-01-01T00:00:00Z",
      "ai_summary": "AI analysis summary",
      "ai_corrections": "AI suggested corrections",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "author_name": "John Doe",
      "categories": ["Morning Duas"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### Create Dua

**POST** `/duas`

Create a new dua.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Dua for Success",
  "purpose": "A dua for seeking success",
  "arabic_text": "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
  "english_meaning": "In the name of Allah",
  "transliteration": "Bismillah ir-Rahman ir-Raheem",
  "native_meaning": "In the name of Allah",
  "source_reference": "Quran 1:1",
  "categories": ["Morning Duas"],
  "is_public": false
}
```

**Response:**
```json
{
  "message": "Dua created successfully",
  "dua": {
    "id": "uuid",
    "title": "Dua for Success",
    "purpose": "A dua for seeking success",
    "arabic_text": "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
    "english_meaning": "In the name of Allah",
    "transliteration": "Bismillah ir-Rahman ir-Raheem",
    "native_meaning": "In the name of Allah",
    "source_reference": "Quran 1:1",
    "is_public": false,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

---

## AI Endpoints

### Get AI Analysis

**GET** `/ai/analysis/:contentType/:contentId`

Get AI analysis for content using Gemma 2 27B model.

**Headers:** `Authorization: Bearer <token>`

**Parameters:**
- `contentType`: Content type (dua, blog, question, answer)
- `contentId`: Content UUID

**Response:**
```json
{
  "status": "completed",
  "analysis": {
    "summary": "This dua appears to be authentic and well-sourced...",
    "corrections": "Consider adding more context about when to recite this dua...",
    "authenticity": "The content appears to be Islamic in nature and properly referenced."
  }
}
```

**Possible Status Values:**
- `completed`: Analysis finished successfully
- `pending`: Analysis queued
- `processing`: Analysis in progress
- `failed`: Analysis failed

### Trigger AI Analysis

**POST** `/ai/analyze/:contentType/:contentId`

Manually trigger AI analysis (scholars+ only).

**Headers:** `Authorization: Bearer <token>`
**Role Required:** Scholar+

**Parameters:**
- `contentType`: Content type (dua, blog, question, answer)
- `contentId`: Content UUID

**Response:**
```json
{
  "message": "AI analysis queued successfully"
}
```

### Get Queue Status

**GET** `/ai/queue/status`

Get AI processing queue status (scholars+ only).

**Headers:** `Authorization: Bearer <token>`
**Role Required:** Scholar+

**Response:**
```json
{
  "queue_status": {
    "dua": {
      "pending": 5,
      "processing": 2,
      "completed": 100,
      "failed": 3
    },
    "blog": {
      "pending": 2,
      "processing": 1,
      "completed": 50,
      "failed": 1
    }
  }
}
```

---

## Support

For API support and questions:
- Email: api-support@mydua.com
- Documentation: https://mydua-backend.vercel.app/docs
- Health Check: https://mydua-backend.vercel.app/health