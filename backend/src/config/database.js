/**
 * Database Configuration and Connection Pool
 * Uses mysql2 with promise-based API for async/await support
 */

const mysql = require('mysql2/promise');
const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/database.log' })
  ]
});

// Create connection pool — sized for production (39+ concurrent users)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'finance_erp',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 30, // 30 concurrent DB connections
  queueLimit: 100,             // max 100 requests queued; beyond this → error (prevents memory bloat)
  connectTimeout: 10000,       // 10s to establish a connection
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000 // ping idle connections every 30s
});

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database connection established successfully');
    connection.release();
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    throw error;
  }
};

// Slow query threshold (ms) — log any query taking longer than this
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS) || 2000;

// Execute query with automatic connection handling + slow query detection
const query = async (sql, params = []) => {
  const start = Date.now();
  try {
    const [results] = await pool.query(sql, params);
    const elapsed = Date.now() - start;
    if (elapsed > SLOW_QUERY_MS) {
      logger.warn('Slow query detected', { elapsed_ms: elapsed, sql: sql.substring(0, 200) });
    }
    return results;
  } catch (error) {
    logger.error('Query execution error:', { sql: sql.substring(0, 200), error: error.message });
    throw error;
  }
};

// Execute transaction with automatic rollback on error
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  
  try {
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    logger.error('Transaction rolled back:', error.message);
    throw error;
  } finally {
    connection.release();
  }
};

// Call stored procedure
const callProcedure = async (procedureName, params = []) => {
  const placeholders = params.map(() => '?').join(', ');
  const sql = `CALL ${procedureName}(${placeholders})`;
  
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    logger.error('Stored procedure error:', { procedureName, error: error.message });
    throw error;
  }
};

module.exports = {
  pool,
  query,
  transaction,
  callProcedure,
  testConnection,
  logger
};
