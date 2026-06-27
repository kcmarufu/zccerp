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
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Fetch user with role and department
      const users = await query(
        `SELECT u.*, r.role_name, d.department_name, d.department_code
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN departments d ON u.department_id = d.id
         WHERE u.email = ? AND u.is_active = TRUE`,
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
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
      );

      // Update last login
      await query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_at = NOW() WHERE id = ?',
        [user.id]
      );

      // Return user data (excluding password)
      const { password_hash, ...userData } = user;

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            ...userData,
            role: user.role_name
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
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

      // Hash new password
      const newHash = await bcrypt.hash(newPassword, 10);

      // Update password
      await query(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
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
