/**
 * Authentication Controller
 * Handles user login, registration, and token management
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

class AuthController {

  /**
   * User login
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
<<<<<<< HEAD
        return res.status(400).json({ success: false, error: 'Email and password are required' });
=======
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
      }

      // Fetch user with role and department
      const users = await query(
        `SELECT u.*, r.role_name, d.department_name, d.department_code
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN departments d ON u.department_id = d.id
         WHERE u.email = ? AND u.is_active = TRUE`,
<<<<<<< HEAD
        [email.toLowerCase().trim()]
      );

      // Use a constant-time response even for unknown users (prevents email enumeration)
      const user = users.length > 0 ? users[0] : null;

      // ── Account lockout check ───────────────────────────────────────────────
      const MAX_ATTEMPTS = 5; // lock after 5 consecutive failures
      const LOCK_MINUTES = 30; // locked for 30 minutes

      if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
        const unlockAt = new Date(user.locked_until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return res.status(423).json({
          success: false,
          error: `Account temporarily locked due to too many failed attempts. Try again after ${unlockAt}.`
        });
      }

      // ── Password check ──────────────────────────────────────────────────────
      const dummyHash = '$2b$12$invalidhashfortimingnormalisationXXXXXXXXXXXXXXXXXX';
      const isValidPassword = await bcrypt.compare(password, user ? user.password_hash : dummyHash);

      if (!user || !isValidPassword) {
        // Record the failed attempt if the user exists
        if (user) {
          const newAttempts = (user.failed_login_attempts || 0) + 1;
          if (newAttempts >= MAX_ATTEMPTS) {
            // Lock the account
            await query(
              'UPDATE users SET failed_login_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE), updated_at = NOW() WHERE id = ?',
              [newAttempts, LOCK_MINUTES, user.id]
            );
          } else {
            await query(
              'UPDATE users SET failed_login_attempts = ?, updated_at = NOW() WHERE id = ?',
              [newAttempts, user.id]
            );
          }
        }
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      // ── Success: reset lockout counters ─────────────────────────────────────
      const accessToken = jwt.sign(
        { userId: user.id, role: user.role_name, departmentId: user.department_id },
=======
        [email.toLowerCase()]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      const user = users[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { 
          userId: user.id,
          role: user.role_name,
          departmentId: user.department_id
        },
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
      );

<<<<<<< HEAD
      await query(
        'UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = ?',
        [user.id]
      );

      const { password_hash, failed_login_attempts, locked_until, ...userData } = user;
=======
      // Update last login
      await query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      // Return user data (excluding password)
      const { password_hash, ...userData } = user;
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87

      res.json({
        success: true,
        message: 'Login successful',
        data: {
<<<<<<< HEAD
          user: { ...userData, role: user.role_name },
=======
          user: {
            ...userData,
            role: user.role_name
          },
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Login error:', error);
<<<<<<< HEAD
      res.status(500).json({ success: false, error: 'Authentication failed' });
=======
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token is required'
        });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      // Fetch fresh user data
      const users = await query(
        `SELECT u.*, r.role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = ? AND u.is_active = TRUE`,
        [decoded.userId]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'User not found or inactive'
        });
      }

      const user = users[0];

      // Generate new access token
      const accessToken = jwt.sign(
        {
          userId: user.id,
          role: user.role_name,
          departmentId: user.department_id
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      res.json({
        success: true,
        data: { accessToken }
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Refresh token has expired. Please login again.'
        });
      }
      res.status(403).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const { password_hash, ...userData } = req.user;
      
      res.json({
        success: true,
        data: userData
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user profile'
      });
    }
  }

  /**
   * Change password
   * POST /api/auth/change-password
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current and new password are required'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 8 characters'
        });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, req.user.password_hash);
      
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }

<<<<<<< HEAD
      // Hash new password (cost 12 — strong for production)
      const newHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await query(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
=======
      // Hash new password
      const newHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await query(
        'UPDATE users SET password_hash = ? WHERE id = ?',
>>>>>>> d4c8bc76b49626037845f6abf644ee02f76d0b87
        [newHash, userId]
      );

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to change password'
      });
    }
  }
}

module.exports = new AuthController();
