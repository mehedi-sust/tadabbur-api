# MyDua Backend Setup Alternatives

## Option 1: Docker Desktop (Current Issue)

**Problem:** Docker Desktop is not running
**Solution:** 
1. Open Docker Desktop from Start menu
2. Wait for it to fully start (green status)
3. Run: `docker-compose up -d postgres redis postgres_test`

## Option 2: Cloud Databases (Recommended)

### PostgreSQL Setup
1. **Supabase** (Free tier available):
   - Go to https://supabase.com
   - Create account and new project
   - Copy the database URL from Settings > Database

2. **Neon** (Free tier available):
   - Go to https://neon.tech
   - Create account and new project
   - Copy the connection string

### Redis Setup
1. **Upstash Redis** (Free tier available):
   - Go to https://upstash.com
   - Create account and new database
   - Copy the Redis URL

### Update Environment Variables
```env
# Replace with your cloud database URLs
DATABASE_URL=postgresql://username:password@your-db-url:5432/mydua_dev
TEST_DATABASE_URL=postgresql://username:password@your-db-url:5432/mydua_test
REDIS_URL=redis://your-redis-url:6379
```

## Option 3: Local Installation

### Install PostgreSQL on Windows
1. Download from: https://www.postgresql.org/download/windows/
2. Install with default settings
3. Remember the password for 'postgres' user
4. Create databases:
   ```sql
   CREATE DATABASE mydua_dev;
   CREATE DATABASE mydua_test;
   ```

### Install Redis on Windows
1. Download from: https://github.com/microsoftarchive/redis/releases
2. Or use WSL2: `wsl --install` then `sudo apt install redis-server`

## Quick Start (Cloud Databases)

1. **Set up cloud databases** (5 minutes)
2. **Update .env file** with your URLs
3. **Run the application:**
   ```bash
   npm install
   npm run dev
   ```

## Verification

Test your setup:
```bash
# Check if backend starts
npm run dev

# Should show:
# Server running on port 3001
# Connected to development database
```

## Troubleshooting

### Docker Issues
- Make sure Docker Desktop is running
- Check Windows features: WSL2, Hyper-V
- Restart Docker Desktop

### Database Connection Issues
- Check your DATABASE_URL format
- Verify database credentials
- Test connection with a database client

### Redis Issues
- Verify REDIS_URL format
- Check if Redis service is running
- Test with: `redis-cli ping`
