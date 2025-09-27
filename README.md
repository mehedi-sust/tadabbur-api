# MyDua Backend API

A comprehensive Express.js backend API for the MyDua Islamic webapp, providing authentication, dua management, blog system, Q&A functionality, and AI-powered content analysis.

## Features

- **Authentication System**: JWT-based auth with role-based access control
- **Dua Management**: CRUD operations for Islamic prayers and supplications
- **AI Integration**: Gemma 3 27B model via Hugging Face for advanced content analysis and verification
- **Blog System**: Unicode support for multiple languages
- **Q&A System**: Question and answer platform with expert moderation
- **User Management**: Role-based permissions (Admin, Manager, Scholar, User)
- **Queue System**: Background processing for AI requests
- **Comprehensive Testing**: Unit tests for all endpoints

## Tech Stack

- **Express.js** - Web framework
- **PostgreSQL** - Database
- **Redis** - Caching and queue management
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Bull** - Queue management
- **Jest** - Testing framework
- **Hugging Face API** - AI services

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL (or use Docker)
- Redis (or use Docker)

### Installation

1. **Clone the repository**
   ```bash
   git clone <backend-repo-url>
   cd mydua-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Start the database**
   ```bash
   docker-compose up -d postgres redis postgres_test
   ```

5. **Set up the database**
   ```bash
   # Connect to PostgreSQL and run the schema
   psql -h localhost -p 5432 -U mydua_user -d mydua_dev -f src/database/schema.sql
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`

## Default Admin Account

After the database initializes, a default admin account is automatically created:

**Admin Credentials:**
- **Email:** `admin@mydua.com`
- **Password:** `Admin123!@#`

⚠️ **Important:** Please change the default password after first login for security.

## Environment Variables

```env
# Database Configuration
DATABASE_URL=postgresql://mydua_user:mydua_password@localhost:5432/mydua_dev
TEST_DATABASE_URL=postgresql://mydua_user:mydua_password@localhost:5433/mydua_test

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3001
NODE_ENV=development

# Hugging Face AI Configuration (Gemma 3 27B)
HF_TOKEN=your-hugging-face-token-here
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-27b-it

# Redis Configuration (for queue system)
REDIS_URL=redis://localhost:6379

# Email Configuration (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

## API Documentation

### Base URL
```
http://localhost:3001/api
```

### Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Endpoints

#### Authentication Routes (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/register` | Register new user | No |
| POST | `/login` | Login user | No |
| GET | `/profile` | Get user profile | Yes |
| PUT | `/profile` | Update user profile | Yes |
| PUT | `/change-password` | Change password | Yes |

**Register User**
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "native_language": "english"
}
```

**Login**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Dua Routes (`/api/duas`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get public duas | No |
| GET | `/my-duas` | Get user's duas | Yes |
| GET | `/:id` | Get single dua | No* |
| POST | `/` | Create new dua | Yes |
| PUT | `/:id` | Update dua | Yes |
| DELETE | `/:id` | Delete dua | Yes |
| POST | `/:id/verify` | Verify dua | Scholar+ |
| GET | `/categories/list` | Get categories | No |

*Public duas are accessible to all, private duas require ownership

**Create Dua**
```bash
POST /api/duas
Authorization: Bearer <token>
Content-Type: application/json

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

**Get Duas with Filters**
```bash
GET /api/duas?page=1&limit=20&search=success&category=Morning&verified=true
```

#### Blog Routes (`/api/blogs`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get published blogs | No |
| GET | `/:id` | Get single blog | No |
| GET | `/my-blogs` | Get user's blogs | Yes |
| POST | `/` | Create new blog | Yes |
| PUT | `/:id` | Update blog | Yes |
| DELETE | `/:id` | Delete blog | Yes |
| GET | `/tags/popular` | Get popular tags | No |

**Create Blog**
```bash
POST /api/blogs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "The Importance of Dua",
  "content": "Dua is a powerful tool in Islam...",
  "excerpt": "Understanding the significance of dua in Islamic practice",
  "tags": ["islam", "dua", "spirituality"]
}
```

#### Question Routes (`/api/questions`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get public questions | No |
| GET | `/:id` | Get question with answers | No |
| GET | `/my-questions` | Get user's questions | Yes |
| POST | `/` | Ask new question | Yes |
| PUT | `/:id` | Update question | Yes |
| DELETE | `/:id` | Delete question | Yes |
| POST | `/:id/answer` | Answer question | Scholar+ |
| POST | `/answers/:answerId/verify` | Verify answer | Scholar+ |
| GET | `/tags/popular` | Get popular tags | No |

**Ask Question**
```bash
POST /api/questions
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "What is the best time to make dua?",
  "content": "I want to know when is the most effective time...",
  "tags": ["dua", "timing", "islam"],
  "is_public": true
}
```

#### User Routes (`/api/users`)

| Method | Endpoint | Description | Auth Required | Role Required |
|--------|----------|-------------|---------------|---------------|
| GET | `/` | Get all users | Yes | Manager+ |
| GET | `/:id` | Get user by ID | Yes | Manager+ |
| PUT | `/:id/role` | Update user role | Yes | Admin |
| PUT | `/:id/status` | Activate/deactivate user | Yes | Admin |
| GET | `/stats/overview` | Get user statistics | Yes | Manager+ |
| PUT | `/preferences` | Update user preferences | Yes | - |
| GET | `/collections/my-collections` | Get user collections | Yes | - |
| POST | `/collections` | Create collection | Yes | - |
| POST | `/collections/:id/duas/:duaId` | Add dua to collection | Yes | - |

#### AI Routes (`/api/ai`)

| Method | Endpoint | Description | Auth Required | Role Required |
|--------|----------|-------------|---------------|---------------|
| GET | `/analysis/:contentType/:contentId` | Get AI analysis | Yes | - |
| POST | `/analyze/:contentType/:contentId` | Trigger AI analysis | Yes | Scholar+ |
| GET | `/queue/status` | Get queue status | Yes | Scholar+ |

**Content Types**: `dua`, `blog`, `question`, `answer`

### Response Format

All API responses follow this format:

**Success Response**
```json
{
  "message": "Operation successful",
  "data": { ... },
  "pagination": { ... } // For paginated endpoints
}
```

**Error Response**
```json
{
  "error": "Error message",
  "errors": [ ... ] // For validation errors
}
```

### Pagination

Paginated endpoints support these query parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

Response includes pagination metadata:
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Test coverage includes:
- Authentication flows
- CRUD operations
- Role-based access control
- Error handling
- Edge cases

## Deployment

### Vercel Deployment

1. **Connect to Vercel**
   ```bash
   npm i -g vercel
   vercel login
   ```

2. **Deploy**
   ```bash
   vercel --prod
   ```

3. **Set environment variables in Vercel dashboard**
   - Add all environment variables from `.env`
   - Set up PostgreSQL and Redis databases

### Environment Setup

For production deployment, ensure you have:
- PostgreSQL database (Supabase, Neon, or Railway)
- Redis instance (Upstash Redis)
- Hugging Face API token
- Secure JWT secret

## Database Schema

The database includes these main tables:
- `users` - User accounts and roles
- `duas` - Islamic prayers and supplications
- `blogs` - Blog posts and articles
- `questions` - Q&A questions
- `answers` - Scholar answers
- `user_collections` - Personal dua collections
- `ai_processing_queue` - AI analysis queue
- `user_preferences` - User settings

See `src/database/schema.sql` for complete schema.

## Queue System

The AI processing queue handles:
- Content analysis requests
- Background processing
- Error handling and retries
- Priority management

Queue status can be monitored via `/api/ai/queue/status`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For API support, email api-support@mydua.com or create an issue in the repository.
