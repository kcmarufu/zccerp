/**
 * Authentication Middleware
 * Handles JWT verification and role-based access control
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { hasPermission, isFinanceManager, ROLES } = require('../config/roles');

/**
 * Verify JWT token and attach user to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch fresh user data from database
    const users = await query(
      `SELECT u.*, r.role_name, d.department_name, d.department_code
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = ? AND u.is_active = TRUE`,
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    req.user = users[0];
    req.user.role = users[0].role_name;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token has expired'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        error: 'Invalid token'
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

/**
 * Check if user has required role(s)
 * @param {string|string[]} allowedRoles - Single role or array of allowed roles
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userRole = req.user.role;

    // ADMIN is the super-admin role and always passes role checks.
    if (userRole === ROLES.ADMIN) {
      return next();
    }
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions for this action'
      });
    }

    next();
  };
};

/**
 * Check if user has required permission(s)
 * @param {string|string[]} requiredPermissions - Required permission(s)
 */
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const hasAllPermissions = requiredPermissions.every(
      permission => hasPermission(userRole, permission)
    );

    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action'
      });
    }

    next();
  };
};

/**
 * Middleware to check department-based access
 * Head of Programs, Finance Clerk & Admin: can see all requests (cross-department)
 * Program Lead: can see requests from their own department only
 * General User: can only see own requests
 */
const requireSameDepartment = async (req, res, next) => {
  try {
    const requestId = req.params.requestId || req.body.requestId;
    
    if (!requestId) {
      return next();
    }

    // Finance Clerk, Admin, and Head of Programs can see all departments.
    if ([ROLES.FINANCE_CLERK, ROLES.ADMIN, ROLES.HEAD_OF_PROGRAMS].includes(req.user.role)) {
      return next();
    }

    // For PROGRAM_LEAD: enforce same-department scope, but allow cross-dept
    // requests that have been explicitly routed to the lead's department.
    if ([ROLES.PROGRAM_LEAD].includes(req.user.role)) {
      const requests = await query(
        'SELECT requester_id, department_id, routing_department_id FROM requests WHERE id = ?',
        [requestId]
      );

      if (requests.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Request not found'
        });
      }

      const r = requests[0];
      const userDept = Number(req.user.department_id);
      // Allow if: own dept request (no cross-dept routing), OR explicitly routed to this dept
      if (Number(r.department_id) === userDept || Number(r.routing_department_id) === userDept) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: 'You can only access requests from your department'
      });
    }

    // For GENERAL_USER: enforce owner-only access.
    const requests = await query(
      'SELECT requester_id, department_id FROM requests WHERE id = ?',
      [requestId]
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    if (requests[0].requester_id === req.user.id) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'You can only access your own requests'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Error checking department access'
    });
  }
};

/**
 * Middleware that restricts access to Finance Managers:
 *   - ADMIN
 *   - HEAD_OF_PROGRAMS or PROGRAM_LEAD in the Finance (AF) department
 * Used to protect write operations on budget lines, donors, and projects.
 */
const requireFinanceManager = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  if (!isFinanceManager(req.user)) {
    return res.status(403).json({
      success: false,
      error: 'Only Finance managers (Finance HOP/Lead or Admin) can perform this action'
    });
  }
  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission,
  requireSameDepartment,
  requireFinanceManager
};
