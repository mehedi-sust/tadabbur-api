# Tadabbur Backend - Vercel Deployment Guide

## Quick Fix for Vercel Deployment

The backend has been restructured to work with Vercel's serverless functions. Here's what changed:

### 1. New Serverless Entry Point
- Created `api/index.js` as the main serverless function
- All routes are now handled through this single entry point
- Database initialization happens on first request

### 2. Updated Vercel Configuration
- `vercel.json` now points to `api/index.js`
- Simplified routing to handle all requests through the main function
- Optimized for serverless execution

### 3. Environment Variables Required

Set these in your Vercel project settings:

```bash
# Database (use Vercel Postgres connection string)
DATABASE_URL=postgres://[credentials]

# Authentication
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=7d

# Hugging Face AI
HF_TOKEN=your-huggingface-token
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-12b-it

# Frontend URL (where your Next.js is deployed)
FRONTEND_URL=https://tadabbur-frontend.vercel.app

# Node Environment
NODE_ENV=production
```

### 4. Deployment Steps

1. **Push to Git**: Commit and push the updated backend code
2. **Vercel Project**: Create a new Vercel project for the backend
3. **Root Directory**: Set the root directory to `backend/`
4. **Environment Variables**: Add all required environment variables
5. **Deploy**: Vercel will automatically detect `vercel.json` and deploy

### 5. Key Changes Made

- **Serverless Function**: `api/index.js` replaces `src/server.js` for Vercel
- **Database Initialization**: Happens on first request, not on startup
- **Error Handling**: Improved for serverless environment
- **Rate Limiting**: Reduced limits for serverless functions
- **Connection Pool**: Optimized for Vercel's serverless environment

### 6. Testing the Deployment

After deployment, test these endpoints:
- `GET /health` - Health check
- `GET /` - API info
- `POST /api/auth/login` - Authentication
- `GET /api/duas` - Duas endpoint

### 7. Common Issues and Solutions

**Issue**: Database connection timeout
**Solution**: Ensure `DATABASE_URL` is correctly set and database is accessible

**Issue**: Function timeout
**Solution**: Check function logs in Vercel dashboard, optimize database queries

**Issue**: CORS errors
**Solution**: Verify `FRONTEND_URL` environment variable is set correctly

### 8. Monitoring

- Check Vercel function logs for any errors
- Monitor database connections in your Postgres provider
- Test all API endpoints after deployment

The backend is now optimized for Vercel's serverless architecture and should deploy successfully.
