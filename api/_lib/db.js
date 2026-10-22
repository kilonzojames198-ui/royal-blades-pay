const { Pool } = require('pg');
const url = process.env.DATABASE_URL || '';
const pool = global._pool || (global._pool = new Pool({
  connectionString: url,
  max: 3,
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
}));
module.exports = { query: (text, params) => pool.query(text, params) };
