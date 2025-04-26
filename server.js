const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Allow frontend to call backend
app.use(cors());

// Connect to PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required by Render.com
});

// Search endpoint
app.get('/search', async (req, res) => {
  const searchQuery = req.query.query;

  try {
    const result = await pool.query(
      `SELECT title, salary FROM jobs WHERE title ILIKE $1 OR company ILIKE $1`,
      [`%${searchQuery}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send('JustAI Jobs Backend is running');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
