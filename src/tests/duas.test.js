const request = require('supertest');
const app = require('../server');
const pool = require('../database/connection');

describe('Duas Routes', () => {
  let authToken;
  let userId;

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM duas WHERE title LIKE $1', ['Test Dua%']);
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['test%']);
    
    // Create a test user
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      native_language: 'english'
    };

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send(userData);

    authToken = registerResponse.body.token;
    userId = registerResponse.body.user.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/duas', () => {
    it('should create a new dua successfully', async () => {
      const duaData = {
        title: 'Test Dua for Success',
        purpose: 'A dua for seeking success in endeavors',
        arabic_text: 'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
        english_meaning: 'In the name of Allah, the Most Gracious, the Most Merciful',
        transliteration: 'Bismillah ir-Rahman ir-Raheem',
        native_meaning: 'In the name of Allah, the Most Gracious, the Most Merciful',
        source_reference: 'Quran 1:1',
        categories: ['Morning Duas'],
        is_public: false
      };

      const response = await request(app)
        .post('/api/duas')
        .set('Authorization', `Bearer ${authToken}`)
        .send(duaData)
        .expect(201);

      expect(response.body.message).toBe('Dua created successfully');
      expect(response.body.dua).toHaveProperty('id');
      expect(response.body.dua.title).toBe(duaData.title);
      expect(response.body.dua.user_id).toBe(userId);
    });

    it('should fail without authentication', async () => {
      const duaData = {
        title: 'Test Dua',
        source_reference: 'Test Source'
      };

      const response = await request(app)
        .post('/api/duas')
        .send(duaData)
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });

    it('should fail with missing required fields', async () => {
      const duaData = {
        title: '', // Empty title
        source_reference: 'Test Source'
      };

      const response = await request(app)
        .post('/api/duas')
        .set('Authorization', `Bearer ${authToken}`)
        .send(duaData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should fail without source reference', async () => {
      const duaData = {
        title: 'Test Dua',
        source_reference: '' // Empty source reference
      };

      const response = await request(app)
        .post('/api/duas')
        .set('Authorization', `Bearer ${authToken}`)
        .send(duaData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/duas', () => {
    beforeEach(async () => {
      // Create test duas
      const duas = [
        {
          title: 'Test Public Dua 1',
          purpose: 'Test purpose 1',
          source_reference: 'Test Source 1',
          is_public: true,
          user_id: userId
        },
        {
          title: 'Test Public Dua 2',
          purpose: 'Test purpose 2',
          source_reference: 'Test Source 2',
          is_public: true,
          user_id: userId
        },
        {
          title: 'Test Private Dua',
          purpose: 'Test purpose 3',
          source_reference: 'Test Source 3',
          is_public: false,
          user_id: userId
        }
      ];

      for (const dua of duas) {
        await pool.query(
          'INSERT INTO duas (title, purpose, source_reference, is_public, user_id) VALUES ($1, $2, $3, $4, $5)',
          [dua.title, dua.purpose, dua.source_reference, dua.is_public, dua.user_id]
        );
      }
    });

    it('should get public duas only', async () => {
      const response = await request(app)
        .get('/api/duas')
        .expect(200);

      expect(response.body.duas).toHaveLength(2);
      expect(response.body.duas.every(dua => dua.is_public)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/duas?page=1&limit=1')
        .expect(200);

      expect(response.body.duas).toHaveLength(1);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
    });

    it('should support search', async () => {
      const response = await request(app)
        .get('/api/duas?search=Test Public Dua 1')
        .expect(200);

      expect(response.body.duas).toHaveLength(1);
      expect(response.body.duas[0].title).toBe('Test Public Dua 1');
    });
  });

  describe('GET /api/duas/my-duas', () => {
    beforeEach(async () => {
      // Create test duas for the user
      const duas = [
        {
          title: 'My Private Dua 1',
          purpose: 'Test purpose 1',
          source_reference: 'Test Source 1',
          is_public: false,
          user_id: userId
        },
        {
          title: 'My Public Dua 1',
          purpose: 'Test purpose 2',
          source_reference: 'Test Source 2',
          is_public: true,
          user_id: userId
        }
      ];

      for (const dua of duas) {
        await pool.query(
          'INSERT INTO duas (title, purpose, source_reference, is_public, user_id) VALUES ($1, $2, $3, $4, $5)',
          [dua.title, dua.purpose, dua.source_reference, dua.is_public, dua.user_id]
        );
      }
    });

    it('should get user\'s own duas', async () => {
      const response = await request(app)
        .get('/api/duas/my-duas')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.duas).toHaveLength(2);
      expect(response.body.duas.every(dua => dua.user_id === userId)).toBe(true);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/duas/my-duas')
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('PUT /api/duas/:id', () => {
    let duaId;

    beforeEach(async () => {
      // Create a test dua
      const result = await pool.query(
        'INSERT INTO duas (title, purpose, source_reference, is_public, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        ['Test Dua to Update', 'Test purpose', 'Test Source', false, userId]
      );
      duaId = result.rows[0].id;
    });

    it('should update dua successfully', async () => {
      const updateData = {
        title: 'Updated Test Dua',
        purpose: 'Updated purpose'
      };

      const response = await request(app)
        .put(`/api/duas/${duaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.message).toBe('Dua updated successfully');
      expect(response.body.dua.title).toBe(updateData.title);
      expect(response.body.dua.purpose).toBe(updateData.purpose);
    });

    it('should fail to update other user\'s dua', async () => {
      // Create another user
      const anotherUserData = {
        name: 'Another User',
        email: 'another@example.com',
        password: 'password123',
        native_language: 'english'
      };

      const anotherUserResponse = await request(app)
        .post('/api/auth/register')
        .send(anotherUserData);

      const anotherUserToken = anotherUserResponse.body.token;

      const updateData = {
        title: 'Unauthorized Update'
      };

      const response = await request(app)
        .put(`/api/duas/${duaId}`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Dua not found or access denied');
    });
  });

  describe('DELETE /api/duas/:id', () => {
    let duaId;

    beforeEach(async () => {
      // Create a test dua
      const result = await pool.query(
        'INSERT INTO duas (title, purpose, source_reference, is_public, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        ['Test Dua to Delete', 'Test purpose', 'Test Source', false, userId]
      );
      duaId = result.rows[0].id;
    });

    it('should delete dua successfully', async () => {
      const response = await request(app)
        .delete(`/api/duas/${duaId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Dua deleted successfully');
    });

    it('should fail to delete other user\'s dua', async () => {
      // Create another user
      const anotherUserData = {
        name: 'Another User',
        email: 'another@example.com',
        password: 'password123',
        native_language: 'english'
      };

      const anotherUserResponse = await request(app)
        .post('/api/auth/register')
        .send(anotherUserData);

      const anotherUserToken = anotherUserResponse.body.token;

      const response = await request(app)
        .delete(`/api/duas/${duaId}`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .expect(404);

      expect(response.body.error).toBe('Dua not found or access denied');
    });
  });
});
