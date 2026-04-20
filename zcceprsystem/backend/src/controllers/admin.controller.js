/**
 * Admin Controller
 * Handles user management, password resets, and admin operations
 */

const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

class AdminController {

  /**
   * Get all users with department and role info
   * GET /api/admin/users
   */
  async getAllUsers(req, res) {
    try {
      const users = await query(
        `SELECT u.id, u.email, u.first_name, u.last_name,
                u.is_active, u.last_login, u.created_at, u.updated_at,
                r.role_name as role, r.role_description,
                d.department_name, d.department_code, u.department_id
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         ORDER BY u.created_at DESC`
      );
      res.json({ success: true, data: users });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  }

  /**
   * Get a single user by ID
   * GET /api/admin/users/:userId
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const users = await query(
        `SELECT u.id, u.email, u.first_name, u.last_name,
                u.is_active, u.last_login, u.created_at, u.updated_at,
                r.role_name as role, r.role_description,
                d.department_name, d.department_code, u.department_id
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE u.id = ?`,
        [userId]
      );
      if (users.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      res.json({ success: true, data: users[0] });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
  }

  /**
   * Create a new user
   * POST /api/admin/users
   */
  async createUser(req, res) {
    try {
      const { email, first_name, last_name, password, role, department_id } = req.body;

      if (!email || !first_name || !last_name || !password) {
        return res.status(400).json({ success: false, error: 'All fields are required' });
      }

      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      }

      // Check if email already exists
      const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, error: 'Email already registered' });
      }

      // Get role ID
      const roles = await query('SELECT id FROM roles WHERE role_name = ?', [role || 'GENERAL_USER']);
      if (roles.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid role' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role_id, department_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        [email, hashedPassword, first_name, last_name, roles[0].id, department_id]
      );

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ success: false, error: 'Failed to create user' });
    }
  }

  /**
   * Update user details
   * PUT /api/admin/users/:userId
   */
  async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const { email, first_name, last_name, role, department_id, is_active } = req.body;

      // Check user exists
      const users = await query('SELECT id FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Check email uniqueness if changed
      if (email) {
        const emailCheck = await query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
        if (emailCheck.length > 0) {
          return res.status(400).json({ success: false, error: 'Email already in use by another user' });
        }
      }

      // Get role ID if role changed
      let roleId = null;
      if (role) {
        const roles = await query('SELECT id FROM roles WHERE role_name = ?', [role]);
        if (roles.length > 0) {
          roleId = roles[0].id;
        }
      }

      let updateQuery = 'UPDATE users SET updated_at = NOW()';
      const params = [];

      if (email) { updateQuery += ', email = ?'; params.push(email); }
      if (first_name) { updateQuery += ', first_name = ?'; params.push(first_name); }
      if (last_name) { updateQuery += ', last_name = ?'; params.push(last_name); }
      if (roleId) { updateQuery += ', role_id = ?'; params.push(roleId); }
      if (department_id !== undefined) { updateQuery += ', department_id = ?'; params.push(department_id); }
      if (is_active !== undefined) { updateQuery += ', is_active = ?'; params.push(is_active); }

      updateQuery += ' WHERE id = ?';
      params.push(userId);

      await query(updateQuery, params);

      res.json({ success: true, message: 'User updated successfully' });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ success: false, error: 'Failed to update user' });
    }
  }

  /**
   * Reset user password
   * POST /api/admin/users/:userId/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      }

      const users = await query('SELECT id FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await query(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
        [hashedPassword, userId]
      );

      // Log the password reset
      await query(
        `INSERT INTO approval_logs (request_id, approver_id, approver_role, action, comments, ip_address)
         VALUES (0, ?, 'FINANCE_CLERK', 'PASSWORD_RESET', ?, ?)`,
        [req.user.id, `Password reset for user ID ${userId}`, req.ip]
      ).catch(() => {}); // Don't fail if log table doesn't support this

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
  }

  /**
   * Toggle user active status
   * PATCH /api/admin/users/:userId/toggle-active
   */
  async toggleActive(req, res) {
    try {
      const { userId } = req.params;

      // Prevent self-deactivation
      if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
      }

      const users = await query('SELECT id, is_active FROM users WHERE id = ?', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const newStatus = !users[0].is_active;
      await query(
        'UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?',
        [newStatus, userId]
      );

      res.json({
        success: true,
        message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`,
        data: { is_active: newStatus }
      });
    } catch (error) {
      console.error('Error toggling user status:', error);
      res.status(500).json({ success: false, error: 'Failed to toggle user status' });
    }
  }

  /**
   * Get user login history
   * GET /api/admin/users/:userId/login-history
   */
  async getLoginHistory(req, res) {
    try {
      const { userId } = req.params;

      // Try to get login history from approval_logs or a dedicated table
      // For now, return the last login info and any logged auth events
      const history = await query(
        `SELECT al.created_at as login_at, al.ip_address, 
                CASE WHEN al.action = 'LOGIN_SUCCESS' THEN TRUE ELSE FALSE END as success
         FROM approval_logs al
         WHERE al.approver_id = ? AND al.action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED')
         ORDER BY al.created_at DESC
         LIMIT 20`,
        [userId]
      ).catch(() => []);

      // If no login history exists in logs, return a basic entry from user record
      if (history.length === 0) {
        const user = await query('SELECT last_login FROM users WHERE id = ?', [userId]);
        if (user.length > 0 && user[0].last_login) {
          return res.json({
            success: true,
            data: [{ login_at: user[0].last_login, ip_address: '-', success: true }]
          });
        }
      }

      res.json({ success: true, data: history });
    } catch (error) {
      console.error('Error fetching login history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch login history' });
    }
  }
}

module.exports = new AdminController();
