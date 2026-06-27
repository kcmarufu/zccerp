/**
 * Admin Controller
 * Handles user management, password resets, and admin operations
 */

const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

class AdminController {

  /**
   * Super-admin overview across core modules.
   * GET /api/admin/overview
   */
  async getOverallOverview(req, res) {
    const safe = async (sql, params = [], fallback = []) => {
      try {
        return await query(sql, params);
      } catch (error) {
        return fallback;
      }
    };

    try {
      const [
        users,
        departments,
        requests,
        budgets,
        assets,
        hrEmployees,
        recentApprovals,
        recentBudgetTransactions,
        roleDistribution,
        departmentDistribution
      ] = await Promise.all([
        safe('SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM users'),
        safe('SELECT COUNT(*) as total FROM departments WHERE is_active = TRUE'),
        safe(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN status IN ('PENDING_LEAD_APPROVAL', 'PENDING_HOP_APPROVAL', 'PENDING_FINANCE_APPROVAL', 'PENDING_RECONCILIATION', 'RECON_PENDING_LEAD', 'RECON_PENDING_FINANCE') THEN 1 ELSE 0 END) as pending,
                  SUM(CASE WHEN status IN ('APPROVED', 'DISPATCHED', 'RECONCILED') THEN 1 ELSE 0 END) as approved,
                  SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
           FROM requests`
        ),
        safe(
          `SELECT COUNT(*) as total,
                  COALESCE(SUM(allocated_amount), 0) as allocated,
                  COALESCE(SUM(spent_amount), 0) as spent
           FROM budget_lines
           WHERE is_active = TRUE`
        ),
        safe('SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM assets', [], [{ total: 0, active: 0 }]),
        safe('SELECT COUNT(*) as total, SUM(CASE WHEN employment_status = \'ACTIVE\' THEN 1 ELSE 0 END) as active FROM hr_employees', [], [{ total: 0, active: 0 }]),
        safe(
          `SELECT al.created_at,
                  al.action,
                  al.approver_role,
                  al.comments,
                  r.request_code,
                  CONCAT(u.first_name, ' ', u.last_name) as actor_name
           FROM approval_logs al
           LEFT JOIN requests r ON r.id = al.request_id
           LEFT JOIN users u ON u.id = al.approver_id
           ORDER BY al.created_at DESC
           LIMIT 15`
        ),
        safe(
          `SELECT bt.created_at,
                  bt.transaction_type,
                  bt.amount,
                  bl.budget_code,
                  CONCAT(u.first_name, ' ', u.last_name) as actor_name
           FROM budget_transactions bt
           LEFT JOIN budget_lines bl ON bl.id = bt.budget_line_id
           LEFT JOIN users u ON u.id = bt.performed_by
           ORDER BY bt.created_at DESC
           LIMIT 15`
        ),
        safe(
          `SELECT r.role_name as role, COUNT(*) as count
           FROM users u
           JOIN roles r ON u.role_id = r.id
           GROUP BY r.role_name
           ORDER BY count DESC`
        ),
        safe(
          `SELECT d.department_name, d.department_code,
                  COUNT(u.id) as user_count,
                  COALESCE(SUM(CASE WHEN u.is_active = TRUE THEN 1 ELSE 0 END), 0) as active_users
           FROM departments d
           LEFT JOIN users u ON u.department_id = d.id
           GROUP BY d.id, d.department_name, d.department_code
           ORDER BY d.department_name`
        )
      ]);

      return res.json({
        success: true,
        data: {
          summary: {
            users: users[0] || { total: 0, active: 0 },
            departments: departments[0] || { total: 0 },
            requests: requests[0] || { total: 0, pending: 0, approved: 0, rejected: 0 },
            budgets: budgets[0] || { total: 0, allocated: 0, spent: 0 },
            assets: assets[0] || { total: 0, active: 0 },
            hrEmployees: hrEmployees[0] || { total: 0, active: 0 }
          },
          roleDistribution,
          departmentDistribution,
          recentApprovals,
          recentBudgetTransactions
        }
      });
    } catch (error) {
      console.error('Error fetching admin overview:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch admin overview' });
    }
  }

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

      // Auto-generate unique employee_id (format: EMP0001)
      const maxRes = await query(
        "SELECT MAX(CAST(SUBSTRING(employee_id, 4) AS UNSIGNED)) as mx FROM users WHERE employee_id REGEXP '^EMP[0-9]+$'"
      );
      const nextNum = (maxRes[0]?.mx || 0) + 1;
      const employee_id = `EMP${String(nextNum).padStart(4, '0')}`;

      const hashedPassword = await bcrypt.hash(password, 12);

      const result = await query(
        `INSERT INTO users (employee_id, email, password_hash, first_name, last_name, role_id, department_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        [employee_id, email, hashedPassword, first_name, last_name, roles[0].id, department_id]
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
   * Permanently delete a user (Admin only)
   * DELETE /api/admin/users/:userId
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const targetId = parseInt(userId);

      // Prevent self-deletion
      if (targetId === req.user.id) {
        return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
      }

      const users = await query(
        `SELECT u.id, u.email, r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?`,
        [targetId]
      );
      if (users.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const targetUser = users[0];

      // Prevent deleting the last admin account
      if (targetUser.role_name === 'ADMIN') {
        const adminCount = await query(
          `SELECT COUNT(*) as cnt FROM users u JOIN roles r ON u.role_id = r.id WHERE r.role_name = 'ADMIN' AND u.is_active = TRUE`
        );
        if ((adminCount[0]?.cnt || 0) <= 1) {
          return res.status(400).json({ success: false, error: 'Cannot delete the last active admin account' });
        }
      }

      // Check if user has associated requests — deactivate instead of hard delete if so
      const requestCount = await query('SELECT COUNT(*) as cnt FROM requests WHERE requester_id = ?', [targetId]);
      if ((requestCount[0]?.cnt || 0) > 0) {
        // Soft delete — deactivate instead
        await query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = ?', [targetId]);
        return res.json({ success: true, message: 'User has existing requests — account deactivated instead of deleted', softDelete: true });
      }

      await query('DELETE FROM users WHERE id = ?', [targetId]);
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
  }

  // ============================================================================
  // DEPARTMENT MANAGEMENT
  // ============================================================================

  /**
   * Get all departments with user counts
   * GET /api/admin/departments
   */
  async getDepartments(req, res) {
    try {
      const departments = await query(
        `SELECT d.id, d.department_name, d.department_code, d.description, d.is_active, d.created_at,
                COUNT(u.id) as user_count,
                COALESCE(SUM(CASE WHEN u.is_active = TRUE THEN 1 ELSE 0 END), 0) as active_user_count
         FROM departments d
         LEFT JOIN users u ON u.department_id = d.id
         GROUP BY d.id, d.department_name, d.department_code, d.description, d.is_active, d.created_at
         ORDER BY d.department_name`
      );
      res.json({ success: true, data: departments });
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch departments' });
    }
  }

  /**
   * Create a new department
   * POST /api/admin/departments
   */
  async createDepartment(req, res) {
    try {
      const { department_name, department_code, description } = req.body;
      if (!department_name || !department_code) {
        return res.status(400).json({ success: false, error: 'Department name and code are required' });
      }

      const existing = await query(
        'SELECT id FROM departments WHERE department_name = ? OR department_code = ?',
        [department_name, department_code.toUpperCase()]
      );
      if (existing.length > 0) {
        return res.status(400).json({ success: false, error: 'Department name or code already exists' });
      }

      const result = await query(
        `INSERT INTO departments (department_name, department_code, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, TRUE, NOW(), NOW())`,
        [department_name, department_code.toUpperCase(), description || null]
      );
      res.status(201).json({ success: true, message: 'Department created', data: { id: result.insertId } });
    } catch (error) {
      console.error('Error creating department:', error);
      res.status(500).json({ success: false, error: 'Failed to create department' });
    }
  }

  /**
   * Update a department
   * PUT /api/admin/departments/:id
   */
  async updateDepartment(req, res) {
    try {
      const { id } = req.params;
      const { department_name, department_code, description, is_active } = req.body;

      const depts = await query('SELECT id FROM departments WHERE id = ?', [id]);
      if (depts.length === 0) {
        return res.status(404).json({ success: false, error: 'Department not found' });
      }

      // Check uniqueness
      if (department_name || department_code) {
        const conflict = await query(
          'SELECT id FROM departments WHERE (department_name = ? OR department_code = ?) AND id != ?',
          [department_name || '', (department_code || '').toUpperCase(), id]
        );
        if (conflict.length > 0) {
          return res.status(400).json({ success: false, error: 'Department name or code already used by another department' });
        }
      }

      let updateSql = 'UPDATE departments SET updated_at = NOW()';
      const params = [];
      if (department_name) { updateSql += ', department_name = ?'; params.push(department_name); }
      if (department_code) { updateSql += ', department_code = ?'; params.push(department_code.toUpperCase()); }
      if (description !== undefined) { updateSql += ', description = ?'; params.push(description); }
      if (is_active !== undefined) { updateSql += ', is_active = ?'; params.push(is_active); }
      updateSql += ' WHERE id = ?';
      params.push(id);

      await query(updateSql, params);
      res.json({ success: true, message: 'Department updated' });
    } catch (error) {
      console.error('Error updating department:', error);
      res.status(500).json({ success: false, error: 'Failed to update department' });
    }
  }

  /**
   * Delete a department
   * DELETE /api/admin/departments/:id
   */
  async deleteDepartment(req, res) {
    try {
      const { id } = req.params;

      const userCount = await query(
        'SELECT COUNT(*) as cnt FROM users WHERE department_id = ?', [id]
      );
      if ((userCount[0]?.cnt || 0) > 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete department — it has ${userCount[0].cnt} user(s) assigned. Reassign users first.`
        });
      }

      const depts = await query('SELECT id FROM departments WHERE id = ?', [id]);
      if (depts.length === 0) {
        return res.status(404).json({ success: false, error: 'Department not found' });
      }

      // Soft delete — deactivate
      await query('UPDATE departments SET is_active = FALSE, updated_at = NOW() WHERE id = ?', [id]);
      res.json({ success: true, message: 'Department deactivated' });
    } catch (error) {
      console.error('Error deleting department:', error);
      res.status(500).json({ success: false, error: 'Failed to delete department' });
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
