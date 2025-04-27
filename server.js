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

// API: Search jobs with extra fields
app.get('/api/jobs/search', async (req, res) => {
  const { query } = req.query;

  try {
    const result = await pool.query(
      `SELECT 
         j.title, 
         j.salary, 
         j.description, 
         u.company, 
         TO_CHAR(j.created_at, 'YYYY-MM-DD') AS posted_date
       FROM Jobs j
       LEFT JOIN Users u ON j.employer_id = u.user_id
       WHERE (j.title ILIKE $1 OR j.description ILIKE $1)
       AND j.job_status = 'Open'
       ORDER BY j.created_at DESC`,
      [`%${query}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Job Search Error:', error.message);
    res.status(500).json({ message: "Server error searching jobs." });
  }
});




// ========================
// REGISTER ENDPOINT
// ========================
// API: Register User (Updated with dynamic validation)
app.post('/api/register', async (req, res) => {
  const { name, email, password, account_type, role, company } = req.body;

  if (!name || !email || !password || !account_type) {
    return res.status(400).json({ message: "Name, email, password, and account type are required." });
  }

  if (account_type === "Employer") {
    if (!role || !company) {
      return res.status(400).json({ message: "Role and Company are required for Employers." });
    }
  }

  try {
    // Check if email already exists
    const userExists = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Email already registered." });
    }

    // Insert new user
    await pool.query(
      `INSERT INTO Users (name, email, password, account_type, role, company, status, created_at, modified_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active', NOW(), NOW())`,
      [name, email, password, account_type, role || null, company || null]
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
// API: Get Top 3 Highest Salary Jobs
app.get('/api/jobs/top-salary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT title, description, salary, job_type
       FROM Jobs
       WHERE job_status = 'Open'
       ORDER BY salary DESC
       LIMIT 3`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Top Salary Jobs Error:', error.message);
    res.status(500).json({ message: "Server error fetching top salary jobs." });
  }
});

// ========================
// FETCH TOP NEWEST POSTED JOBS ENDPOINT
// ========================

// API: Get Top 3 Newest Posted Jobs
app.get('/api/jobs/newest', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT title, description, salary, job_type
       FROM Jobs
       WHERE job_status = 'Open'
       ORDER BY created_at DESC
       LIMIT 3`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Newest Jobs Error:', error.message);
    res.status(500).json({ message: "Server error fetching newest jobs." });
  }
});






// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


