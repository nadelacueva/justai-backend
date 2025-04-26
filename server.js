require('dotenv').config();            // Load .env first
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// 1) Enable JSON body parsing (in case you expand to POST later)
app.use(express.json());

// 2) Configure CORS to allow only your frontend origin
const FRONTEND_URL = process.env.FRONTEND_URL || '*'; 
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// 3) Connect to PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }   // Render requirement for SSL
});

// 4) Health-check route
app.get('/', (req, res) => {
  res.send('JustAI Jobs Backend is running');
});

// 5) Search endpoint under /api/jobs/search
app.get('/api/jobs/search', async (req, res) => {
  const searchQuery = req.query.query || '';
  try {
    const result = await pool.query(
      `SELECT title, salary 
         FROM jobs 
        WHERE title ILIKE $1 
           OR company ILIKE $1`,
      [`%${searchQuery}%`]
    );
    res.json({ jobs: result.rows });
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 6) Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
