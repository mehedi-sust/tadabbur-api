# MyDua API Documentation

## Overview

The MyDua API is a comprehensive REST API for managing Islamic content including duas, blogs, Q&A, and user management. It provides authentication, role-based access control, AI-powered content analysis, and expert verification systems.

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

**Validation:**
- `name`: Required, 2-255 characters
- `email`: Required, valid email format
- `password`: Required, minimum 6 characters
- `native_language`: Optional, max 50 characters

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

### Update User Profile

**PUT** `/auth/profile`

Update user profile information.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "John Smith",
  "native_language": "arabic"
}
```

**Response:**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "uuid",
    "name": "John Smith",
    "email": "john@example.com",
    "role": "user",
    "native_language": "arabic"
  }
}
```

### Change Password

**PUT** `/auth/change-password`

Change user password.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
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

**Example:**
```
GET /duas?page=1&limit=10&search=success&category=Morning&verified=true
```

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
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

### Get User's Duas

**GET** `/duas/my-duas`

Get paginated list of user's own duas.

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:** Same as public duas endpoint

**Response:** Same format as public duas endpoint

### Get Single Dua

**GET** `/duas/:id`

Get detailed information about a specific dua.

**Parameters:**
- `id`: Dua UUID

**Response:**
```json
{
  "dua": {
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

**Validation:**
- `title`: Required, 1-500 characters
- `purpose`: Optional, max 1000 characters
- `arabic_text`: Optional
- `english_meaning`: Optional
- `transliteration`: Optional
- `native_meaning`: Optional
- `source_reference`: Required, non-empty
- `categories`: Optional array
- `is_public`: Optional boolean (default: false)

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

### Update Dua

**PUT** `/duas/:id`

Update an existing dua.

**Headers:** `Authorization: Bearer <token>`

**Parameters:**
- `id`: Dua UUID

**Request Body:** Same as create dua (all fields optional)

**Response:**
```json
{
  "message": "Dua updated successfully",
  "dua": {
    "id": "uuid",
    "title": "Updated Dua for Success",
    "purpose": "Updated purpose",
    "arabic_text": "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
    "english_meaning": "In the name of Allah",
    "transliteration": "Bismillah ir-Rahman ir-Raheem",
    "native_meaning": "In the name of Allah",
    "source_reference": "Quran 1:1",
    "is_public": true,
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### Delete Dua

**DELETE** `/duas/:id`

Delete a dua.

**Headers:** `Authorization: Bearer <token>`

**Parameters:**
- `id`: Dua UUID

**Response:**
```json
{
  "message": "Dua deleted successfully"
}
```

### Verify Dua

**POST** `/duas/:id/verify`

Verify a public dua (scholars only).

**Headers:** `Authorization: Bearer <token>`
**Role Required:** Scholar+

**Parameters:**
- `id`: Dua UUID

**Response:**
```json
{
  "message": "Dua verified successfully",
  "dua": {
    "id": "uuid",
    "is_verified": true,
    "verified_by": "scholar-uuid",
    "verified_at": "2024-01-01T00:00:00Z"
  }
}
```

### Get Dua Categories

**GET** `/duas/categories/list`

Get list of available dua categories.

**Response:**
```json
{
  "categories": [
    {
      "id": "uuid",
      "name": "Morning Duas",
      "description": "Duas to be recited in the morning"
    },
    {
      "id": "uuid",
      "name": "Evening Duas",
      "description": "Duas to be recited in the evening"
    }
  ]
}
```

---

## Support

For API support and questions:
- Email: api-support@mydua.com
- Documentation: https://mydua-backend.vercel.app/docs
- Health Check: https://mydua-backend.vercel.app/health
