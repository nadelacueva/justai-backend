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
// REGISTER ENDPOINT
// ========================
// API: Register User (Updated with dynamic validation)
app.post('/api/register', async (req, res) => {
  const { account_type, name, email, password, company, role } = req.body || {};

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
      `INSERT INTO Users (account_type, name, email, password, company, role, status, created_at, modified_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active', NOW(), NOW())`,
      [account_type, name, email, password, company || null, role || null]
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
const jwt = require('jsonwebtoken');

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await pool.query(
      `SELECT user_id, name, email, account_type, profile_picture, rating, status, company, password
       FROM Users 
       WHERE email = $1`, 
      [email]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const dbUser = user.rows[0];

    if (dbUser.password !== password) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { user_id: dbUser.user_id, email: dbUser.email, account_type: dbUser.account_type },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        user_id: dbUser.user_id,
        name: dbUser.name,
        email: dbUser.email,
        account_type: dbUser.account_type,
        profile_picture: dbUser.profile_picture,
        rating: dbUser.rating,
        status: dbUser.status,
        company: dbUser.company
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


// ========================
// JOB SEARCH ENDPOINT
// ========================

// Updated API: Search jobs with optional job_type filter
app.get('/api/jobs/search', async (req, res) => {
  const { query, job_type, sort = 'newest' } = req.query;  // Default to 'newest' for sort

  // Check if the 'query' parameter is provided
  if (!query) {
    return res.status(400).json({ message: "Search query is required." });
  }

  try {
    let sql = `
      SELECT 
        j.title, 
        j.salary, 
        j.description, 
        u.company, 
        TO_CHAR(j.created_at, 'YYYY-MM-DD') AS posted_date
      FROM Jobs j
      LEFT JOIN Users u ON j.employer_id = u.user_id
      WHERE (j.title ILIKE $1 OR j.description ILIKE $1)
      AND j.job_status = 'Open'
    `;

    const values = [`%${query}%`];

    if (job_type) {
      sql += ` AND j.job_type = $2`;
      values.push(job_type);
    }

    // Conditional sorting based on sort
    if (sort === 'salary') {
      sql += ' ORDER BY j.salary DESC';  // Sort by highest salary
    } else {
      sql += ' ORDER BY j.created_at DESC';  // Default to newest
    }

    const result = await pool.query(sql, values);

    res.json(result.rows);
  } catch (error) {
    console.error('Job Search Error:', error.message);
    res.status(500).json({ message: "Server error searching jobs." });
  }
});


// ========================
// USER PROFILE INFO ENDPOINT
// ========================
// API: Get Dashboard Profile Info (dynamic for Employer or Worker)
app.get('/api/users/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Authorization header missing." });
    }

    const token = authHeader.split(' ')[1]; // Get the token part after "Bearer"
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user_id = decoded.user_id; // ✅ Extract from token, not query string

    // Fetch user's basic info
    const userResult = await pool.query(
      `SELECT name, role, company, account_type, rating
       FROM Users
       WHERE user_id = $1`,
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = userResult.rows[0];
    const isEmployer = user.account_type === 'Employer';

    let dashboardData = { 
      name: user.name,
      role: user.role,
      company: user.company,
      rating: user.rating,
      account_type: user.account_type
    };

    if (!isEmployer) {
      // Worker Metrics
      const workerResult = await pool.query(
        `SELECT 
           COALESCE(SUM(hours_worked), 0) AS total_hours_worked,
           COALESCE(SUM(amount) FILTER (WHERE status = 'Paid'), 0) AS total_earnings,
           COALESCE(SUM(amount) FILTER (WHERE status = 'Pending'), 0) AS pending_payment
         FROM Payments
         WHERE worker_id = $1`,
        [user_id]
      );

      dashboardData = {
        ...dashboardData,
        total_hours_worked: workerResult.rows[0].total_hours_worked,
        total_earnings: workerResult.rows[0].total_earnings,
        pending_payment: workerResult.rows[0].pending_payment
      };

    } else {
      // Employer Metrics
      const employerResult = await pool.query(
        `SELECT 
           COALESCE(SUM(p.hours_worked), 0) AS total_hours_worked,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Paid'), 0) AS total_jobs_paid
         FROM Payments p
         JOIN Jobs j ON p.job_id = j.job_id
         WHERE j.employer_id = $1`,
        [user_id]
      );

      dashboardData = {
        ...dashboardData,
        total_hours_worked: employerResult.rows[0].total_hours_worked,
        total_jobs_paid: employerResult.rows[0].total_jobs_paid
      };
    }

    res.json(dashboardData);

  } catch (error) {
    console.error('Dashboard Profile Error:', error.message);
    res.status(500).json({ message: "Server error fetching dashboard profile." });
  }
});



// ========================
// USER REVIEWS INFO ENDPOINT
// ========================
// API: Get Reviews for Logged-in User
// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ message: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });

    req.user = user; // Attach the user info to request object
    next();
  });
}

// API to get reviews for the logged-in user
app.get('/api/users/me/reviews', authenticateToken, async (req, res) => {
  const user_id = req.user.user_id; // Get user_id from the decoded JWT

  try {
    const result = await pool.query(
      `SELECT 
         r.comment AS review_body,
         r.rating,
         u.name AS reviewer_name,
         TO_CHAR(r.created_at, 'YYYY-MM-DD') AS review_date
       FROM Reviews r
       LEFT JOIN Users u ON r.reviewer_id = u.user_id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC`,
      [user_id] // Pass the logged-in user's user_id
    );

    res.json(result.rows);
  } catch (error) {
    console.error('User Reviews Error:', error.message);
    res.status(500).json({ message: "Server error fetching reviews." });
  }
});


// ========================
// USER APPLICATIONS INFO ENDPOINT
// ========================

// API: Get Applications submitted by Worker
app.get('/api/users/me/applications', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Extract token from the Authorization header
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. No token provided.' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.user_id; // Extract user_id from the token

    const result = await pool.query(
      `SELECT 
         j.title AS job_title,
         j.salary,
         j.description AS job_description,
         TO_CHAR(a.applied_at, 'YYYY-MM-DD') AS applied_date
       FROM Applications a
       LEFT JOIN Jobs j ON a.job_id = j.job_id
       WHERE a.worker_id = $1
       ORDER BY a.applied_at DESC`,
      [user_id] // Use user_id from JWT token
    );

    res.json(result.rows);
  } catch (error) {
    console.error('User Applications Error:', error.message);
    res.status(500).json({ message: "Server error fetching worker applications." });
  }
});

// API: Get Applications received by Employer for their jobs
app.get('/api/users/me/job-applications', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Extract token from the Authorization header
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. No token provided.' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.user_id; // Extract user_id from the token

    const result = await pool.query(
      `SELECT 
         a.status,
         u.name AS applicant_name,
         j.title AS job_title,
         j.salary,
         TO_CHAR(a.applied_at, 'YYYY-MM-DD') AS applied_date
       FROM Applications a
       LEFT JOIN Jobs j ON a.job_id = j.job_id
       LEFT JOIN Users u ON a.worker_id = u.user_id
       WHERE j.employer_id = $1
       ORDER BY a.applied_at DESC`,
      [user_id] // Use user_id from JWT token
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Employer Job Applications Error:', error.message);
    res.status(500).json({ message: "Server error fetching employer job applications." });
  }
});

// ========================
// USER REVIEWS ENDPOINT
// ========================

app.get('/api/users/me/reviews', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Extract token from the Authorization header
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. No token provided.' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.user_id; // Extract user_id from the token

    const result = await pool.query(
      `SELECT 
         r.comment AS review_body,
         r.rating,
         u.name AS reviewer_name,
         TO_CHAR(r.created_at, 'YYYY-MM-DD') AS review_date
       FROM Reviews r
       LEFT JOIN Users u ON r.reviewer_id = u.user_id
       WHERE r.reviewee_id = $1
       ORDER BY r.created_at DESC`,
      [user_id] // Use user_id from JWT token
    );

    res.json(result.rows);
  } catch (error) {
    console.error('User Reviews Error:', error.message);
    res.status(500).json({ message: "Server error fetching reviews." });
  }
});

// ========================
// USER PROFILE ENDPOINT
// ========================

// API: Get User Profile
app.get('/api/users/me', async (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1]; // Extract token from the Authorization header
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. No token provided.' });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.user_id; // Extract user_id from the token

    const result = await pool.query(
      `SELECT 
         user_id, name, email, account_type, profile_picture, rating, status, company
       FROM Users 
       WHERE user_id = $1`,
      [user_id] // Use user_id from JWT token
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('User Profile Error:', error.message);
    res.status(500).json({ message: "Server error fetching user profile." });
  }
});


// ========================
// TESTIMONIALS FOR COMMUNITY
// ========================
// API: Get 4 Testimonials for Community Page
app.get('/api/community/testimonials', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         t.content AS testimonial,
         u.name AS user_name,
         u.company AS company_name
       FROM Testimonials t
       LEFT JOIN Users u ON t.user_id = u.user_id
       WHERE t.to_display = TRUE
       ORDER BY t.created_at DESC
       LIMIT 4`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Community Testimonials Error:', error.message);
    res.status(500).json({ message: "Server error fetching community testimonials." });
  }
});



// ========================
// REVIEWS for COMMUNITY PAGE API
// ========================

// API: Get Top 4 Reviews by Highest Rating for Community Page
app.get('/api/community/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         r.comment AS review_body,
         r.rating,
         u.name AS reviewer_name,
         TO_CHAR(r.created_at, 'YYYY-MM-DD') AS review_date
       FROM Reviews r
       LEFT JOIN Users u ON r.reviewer_id = u.user_id
       ORDER BY r.rating DESC, r.created_at DESC
       LIMIT 4`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Community Reviews Error:', error.message);
    res.status(500).json({ message: "Server error fetching top reviews." });
  }
});


// ========================
// Support Inquiry API
// ========================
app.post('/api/support', async (req, res) => {
  const { user_id, category, email, content } = req.body;

  // Basic validation
  if (!category || !email || !content) {
    return res.status(400).json({ message: "Category, email, and content are required." });
  }

  try {
    await pool.query(
      `INSERT INTO ContactMessages 
         (message_id, user_id, category, email, content, status, created_at, modified_at)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, 'Open', NOW(), NOW())`,
      [
        user_id || null,  // Allow support tickets from guests (no user_id)
        category,
        email,
        content
      ]
    );

    res.status(201).json({ message: "Support inquiry submitted successfully." });
  } catch (error) {
    console.error('Support Inquiry Error:', error.message);
    res.status(500).json({ message: "Server error submitting support inquiry." });
  }
});





// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});


