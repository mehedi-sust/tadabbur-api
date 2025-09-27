# MyDua Backend Deployment Guide

## 🚀 Deployment Overview

The MyDua backend is designed to work with automatic database initialization, supporting both local development and Vercel deployment.

## 📋 Prerequisites

### Local Development
- Docker Desktop running
- Node.js 18+ installed
- PostgreSQL/Redis (via Docker) or cloud databases

### Vercel Production
- Hugging Face token for AI services
- PostgreSQL database (Supabase, Neon, or Vercel Postgres)
- Redis database (optional, for queue system)

## 🔧 Automatic Database Setup

The application automatically handles database initialization when it starts. No manual schema setup required!

### What Gets Initialized Automatically:
1. **Database Tables**: All tables are created with `CREATE TABLE IF NOT EXISTS`
2. **Indexes**: Performance indexes are added
3. **Default Data**: Admin user and categories are seeded
4. **Extensions**: UUID and other PostgreSQL extensions

## 🛠 Local Development Setup

### Option 1: Docker (Recommended)
```bash
# Start dependencies
docker-compose up -d postgres redis postgres_test

# Install dependencies
npm install

# Start development server (auto-initializes DB)
npm run dev
```

### Option 2: Cloud Databases
```bash
# Set up environment variables
cp env.example .env
# Edit .env with your cloud database URLs

# Install dependencies
npm install

# Start development server (auto-initializes DB)
npm run dev
```

## ☁️ Vercel Deployment

### 1. Database Setup
Choose a PostgreSQL provider and create a database:

**Recommended Options:**
- **Vercel Postgres**: Integrated with Vercel
- **Supabase**: Includes additional features 
- **Neon**: Serverless PostgreSQL

### 2. Environment Variables
Set these in Vercel dashboard or via CLI:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:port/db
TEST_DATABASE_URL=postgresql://user:pass@host:port/test_db

# AI Service
HF_TOKEN=your-hugging-face-token
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-27b-it

# Redis (optional)
REDIS_URL=rediss://user:pass@host:port

# JWT
JWT_SECRET=your-jwt-secret

# Server
NODE_ENV=production
PORT=3001
```

### 3. Deploy to Vercel

**Method 1: Vercel CLI**
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables
vercel env add DATABASE_URL
vercel env add HF_TOKEN
# ... add other variables

# Deploy production version
vercel --prod
```

**Method 2: GitHub Integration**
1. Push code to GitHub repository
2. Connect GitHub repo to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically

### 4. Post-Deployment
The database will be automatically initialized on first run. Check:
- Health endpoint: `https://your-app.vercel.app/health`
- API docs: Available at deployment URL
- Admin user created: `admin@mydua.com` / `admin123`

## 🔍 Environment Variables Reference

### Required Variables
```env
DATABASE_URL=postgresql://# Database connection
HF_TOKEN=# Hugging Face API token
JWT_SECRET=# JWT signing secret
```

### Optional Variables
```env
TEST_DATABASE_URL=# Test database for testing
REDIS_URL=rediss://# Redis URL for queue processing
FRONTEND_URL=# Frontend URL for CORS
```

### Default Values (automatic)
```env
NODE_ENV=development|production
PORT=3001
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-27b-it
```

## 📊 Database Schema

The following tables are automatically created:

- `users` - User accounts and authentication
- `duas` - Islamic prayers and supplications
- `blogs` - Islamic blog posts
- `questions` - Q&A questions
- `answers` - Q&A expert answers
- `dua_categories` - Categorization of duas
- `user_collections` - Personal dua collections
- `ai_processing_queue` - AI analysis queue
- `user_preferences` - User settings

## 🔧 Troubleshooting

### Database Connection Issues
```bash
# Check database connection
node src/scripts/setup-database.js

# Debug database URL
echo $DATABASE_URL
```

### Common Solutions
1. **SSL Certificate Issues**: Add `?sslmode=require` to DATABASE_URL
2. **Connection Pool Exhausted**: Increase `max` pool size
3. **Timeout Issues**: Increase connection timeout in connection.js

### Logs Checking
```bash
# Check application logs
vercel logs

# Check function logs
vercel logs --follow
```

## ⚡ Performance Optimization

### Production Settings
- Use connection pooling for database
- Enable Redis for queue system 
- Use CDN for static files
- Enable compression

### Monitoring
- Set up Vercel Analytics
- Monitor database performance
- Track API response times
- Watch error rates

## 🔒 Security Checklist

✅ Environment variables secured  
✅ Database credentials not exposed  
✅ JWT tokens properly signed  
✅ CORS configured for production  
✅ Rate limiting enabled  
✅ SSL/TLS encrypted connections  

## 🚦 Health Checks

Monitor application status:
- `/health` - Basic health check
- `/api/auth/login` - Authentication system
- Database connectivity through logs
- AI service integration through queue status

## 📈 Scaling Considerations

For high traffic:
- Use database connection pooling
- Enable Redis caching
- Implement load balancing
- Monitor API rate limits
- Set up monitoring alerts

The application is now ready for production deployment! 🎉
