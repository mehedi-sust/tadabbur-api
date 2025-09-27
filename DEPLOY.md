# MyDua Backend - Vercel Deployment Guide

## Prerequisites
- Node.js version 16.x+ on (Vercel)
- PostgreSQL database (Vercel Postgres recommended)
- Environment variables set correctly

## Environment Variables Required
```bash
# Database (use Vercel Postgres connection string)
DATABASE_URL=postgres://[credentials]

# Authentication
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=7d

# Hugging Face AI
HF_TOKEN=your-huggingface-token
HF_API_URL=https://api-inference.huggingface.co/models/google/gemma-3-27b-it

# Frontend URL (where your Next.js is deployed)
FRONTEND_URL=https://mydua-frontend.vercel.app
```

## Deployment Steps
1. **Git Push**: Push the backend changes to your repository
2. **Vercel setup**: Create Vercel Project and select backend folder root
3. **Add environment variables** as shown above
4. **Deploy**: Vercel automatically detects `vercel.json` and starts building.

## Key Configuration Points
- No Redis; Queue happens through inline processing
- Connection timeouts and pool size are optimized for Vercel
- Admin user is auto-created on initial start with email `admin@mydua.com` and password `Admin123!@#`

## Notes About Vercel Deployment
- Apple the database size caps and request timeout limits in Vercel Free tier
- Serverless functions scale automatically 
- Connection to database is guaranteed with PG adapter

For help: https://github.com/[project]/mydua-backend#architecture
