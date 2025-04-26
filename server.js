// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

// Enable JSON parsing & CORS
app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Health check
app.get('/', (req, res) => {
  res.send('JustAI Jobs Backend is running');
});

// DB connectivity check
app.get('/check-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'success', time: result.rows[0].now });
  } catch (err) {
    console.error('DB check failed:', err.stack);
    res.status(500).json({ status: 'error', message: 'DB connection failed' });
  }
});

// ========================
// SEARCH ENDPOINT
// ========================
app.get('/api/jobs/search', async (req, res) => {
  const searchQuery = req.query.query || '';
  console.log(`Received search request for: "${searchQuery}"`);

  // Basic validation
  if (searchQuery.trim() === '') {
    return res.json({ jobs: [] });
  }

  const sql = `
    SELECT title, salary
      FROM jobs
     WHERE title ILIKE $1
        OR company ILIKE $1
    LIMIT 50
  `;

  try {
    const { rows } = await pool.query(sql, [`%${searchQuery}%`]);
    console.log(`Query returned ${rows.length} rows.`);
    return res.json({ jobs: rows });
  } catch (err) {
    console.error('Error executing search query:', err.stack);
    return res.status(500).json({ error: 'Server error during search' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
