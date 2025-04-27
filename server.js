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
        OR description ILIKE $1
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



// ========================
// REGISTER ENDPOINT
// ========================
// Updated API to register new user with role
app.post('/api/register', async (req, res) => {
  const { name, email, password, account_type, role } = req.body;

  if (!name || !email || !password || !account_type || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    // Check if email already exists
    const userExists = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered." });
    }

    // Insert new user
    await pool.query(
      `INSERT INTO Users (name, email, password, account_type, role, status, created_at, modified_at)
       VALUES ($1, $2, $3, $4, $5, 'Active', NOW(), NOW())`,
      [name, email, password, account_type, role]
    );

    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error('Register Error:', error.message);
    res.status(500).json({ message: "Server error during registration." });
  }
});

// ========================
// LOGIN ENDPOINT
// ========================
// API to login user
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const dbUser = user.rows[0];

    // For now, simple plain text password matching
    if (dbUser.password !== password) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    res.status(200).json({
      message: "Login successful.",
      user: {
        user_id: dbUser.user_id,
        name: dbUser.name,
        email: dbUser.email,
        account_type: dbUser.account_type
      }
    });
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ message: "Server error during login." });
  }
});



// ========================
// FETCH TOP SALARY JOBS ENDPOINT
// ========================
// API to fetch top jobs with optional limit
app.get('/api/jobs', async (req, res) => {
  let { limit } = req.query;

  try {
    // Default limit if not provided
    limit = limit ? parseInt(limit) : 10;

    const result = await pool.query(
      `SELECT * FROM Jobs 
       WHERE job_status = 'Open'
       ORDER BY salary DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Jobs Fetch Error:', error.message);
    res.status(500).json({ message: "Server error fetching jobs." });
  }
});





// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


