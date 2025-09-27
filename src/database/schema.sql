-- MyDua Database Schema
-- Islamic webapp for dua, zikr, supplication, and prayer management

-- Create tables with gen_random_uuid() (Available in PostgreSQL 13+)
-- If not available, app will gracefully handle this

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    native_language VARCHAR(50) DEFAULT 'english',
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'scholar', 'user')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Duas table (prayers, supplications, zikr)
CREATE TABLE IF NOT EXISTS duas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    purpose TEXT,
    arabic_text TEXT,
    english_meaning TEXT,
    transliteration TEXT,
    native_meaning TEXT,
    source_reference TEXT NOT NULL,
    is_public BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    ai_summary TEXT,
    ai_corrections TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories for duas
CREATE TABLE IF NOT EXISTS dua_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many relationship between duas and categories
CREATE TABLE IF NOT EXISTS dua_category_relations (
    dua_id UUID REFERENCES duas(id) ON DELETE CASCADE,
    category_id UUID REFERENCES dua_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (dua_id, category_id)
);

-- Blogs table
CREATE TABLE IF NOT EXISTS blogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    tags TEXT[],
    is_published BOOLEAN DEFAULT true,
    ai_summary TEXT,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Q&A Questions table
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[],
    is_public BOOLEAN DEFAULT true,
    is_answered BOOLEAN DEFAULT false,
    ai_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Q&A Answers table
CREATE TABLE IF NOT EXISTS answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    scholar_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMP,
    ai_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User collections (personal dua collections)
CREATE TABLE IF NOT EXISTS user_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Collection items (duas in collections)
CREATE TABLE IF NOT EXISTS collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID REFERENCES user_collections(id) ON DELETE CASCADE,
    dua_id UUID REFERENCES duas(id) ON DELETE CASCADE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, dua_id)
);

-- AI Processing Queue
CREATE TABLE IF NOT EXISTS ai_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('dua', 'blog', 'question', 'answer')),
    content_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    theme VARCHAR(20) DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    language VARCHAR(50) DEFAULT 'english',
    dua_view_mode VARCHAR(20) DEFAULT 'grid' CHECK (dua_view_mode IN ('grid', 'list')),
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Likes tracking per dua and user
CREATE TABLE IF NOT EXISTS dua_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dua_id UUID REFERENCES duas(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(dua_id, user_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_duas_user_id ON duas(user_id);
CREATE INDEX IF NOT EXISTS idx_duas_is_public ON duas(is_public);
CREATE INDEX IF NOT EXISTS idx_duas_is_verified ON duas(is_verified);
CREATE INDEX IF NOT EXISTS idx_blogs_author_id ON blogs(author_id);
CREATE INDEX IF NOT EXISTS idx_blogs_is_published ON blogs(is_published);
CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_is_public ON questions(is_public);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_scholar_id ON answers(scholar_id);
CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_dua_likes_dua_id ON dua_likes(dua_id);
CREATE INDEX IF NOT EXISTS idx_dua_likes_user_id ON dua_likes(user_id);

-- Insert default data only if tables are empty
-- Insert default categories
INSERT INTO dua_categories (name, description)
SELECT * FROM (
    VALUES 
    ('Morning Duas', 'Duas to be recited in the morning'),
    ('Evening Duas', 'Duas to be recited in the evening'),
    ('Prayer Duas', 'Duas related to Salah'),
    ('Supplications', 'General supplications'),
    ('Zikr', 'Remembrance of Allah'),
    ('Protection Duas', 'Duas for protection and safety'),
    ('Healing Duas', 'Duas for health and healing'),
    ('Forgiveness Duas', 'Duas seeking forgiveness'),
    ('Guidance Duas', 'Duas for guidance and wisdom'),
    ('Gratitude Duas', 'Duas expressing gratitude')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM dua_categories WHERE name = v.name);

-- Insert default admin user only if no admin exists
INSERT INTO users (name, email, password_hash, role)
SELECT 'System Admin', 'admin@mydua.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'admin@mydua.com' OR role = 'admin'
);