/**
 * Request Validators
 * Input validation using express-validator
 */

const { body, param, query } = require('express-validator');

// Validate request creation
const createRequestValidator = [
  body('justification')
    .trim()
    .notEmpty()
    .withMessage('Justification is required')
    .isLength({ max: 2000 })
    .withMessage('Justification must not exceed 2000 characters'),
  
  body('priority')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
    .withMessage('Invalid priority value'),
  
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  
  body('items.*.itemDescription')
    .trim()
    .notEmpty()
    .withMessage('Item description is required')
    .isLength({ max: 500 })
    .withMessage('Item description must not exceed 500 characters'),
  
  body('items.*.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  
  body('items.*.budgetLineId')
    .isInt({ min: 1 })
    .withMessage('Valid budget line ID is required'),
  
  body('items.*.unitOfMeasure')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Unit of measure must not exceed 50 characters'),
  
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters')
];

// Validate request update
const updateRequestValidator = [
  param('requestId')
    .isInt({ min: 1 })
    .withMessage('Valid request ID is required'),
  
  body('justification')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Justification must not exceed 2000 characters'),
  
  body('priority')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
    .withMessage('Invalid priority value'),
  
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one item is required if updating items'),
  
  body('items.*.itemDescription')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Item description cannot be empty')
    .isLength({ max: 500 })
    .withMessage('Item description must not exceed 500 characters'),
  
  body('items.*.quantity')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than 0'),
  
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  
  body('items.*.budgetLineId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid budget line ID is required')
];

// Validate approval action
const approvalValidator = [
  param('requestId')
    .isInt({ min: 1 })
    .withMessage('Valid request ID is required'),
  
  body('action')
    .isIn(['APPROVED', 'REJECTED'])
    .withMessage('Action must be either APPROVED or REJECTED'),
  
  body('comments')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comments must not exceed 2000 characters'),
  
  body('version')
    .isInt({ min: 1 })
    .withMessage('Version number is required for optimistic locking')
];

// Validate budget line operations
const budgetLineValidator = [
  body('budgetCode')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Budget code cannot be empty')
    .isLength({ max: 50 })
    .withMessage('Budget code must not exceed 50 characters'),
  
  body('budgetName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Budget name cannot be empty')
    .isLength({ max: 255 })
    .withMessage('Budget name must not exceed 255 characters'),
  
  body('departmentId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid department ID is required'),
  
  body('fiscalYear')
    .optional()
    .isInt({ min: 2000, max: 2100 })
    .withMessage('Invalid fiscal year'),
  
  body('allocatedAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Allocated amount must be non-negative')
];

// Validate budget top-up
const topUpBudgetValidator = [
  param('budgetLineId')
    .isInt({ min: 1 })
    .withMessage('Valid budget line ID is required'),
  
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Top-up amount must be greater than 0'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters')
];

// Validate pagination
const paginationValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isIn(['created_at', 'updated_at', 'total_amount', 'status', 'priority'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC')
];

// Validate filters
const filterValidator = [
  query('status')
    .optional()
    .isIn(['DRAFT', 'PENDING_LEAD_APPROVAL', 'PENDING_HOP_APPROVAL', 
           'PENDING_FINANCE_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'])
    .withMessage('Invalid status filter'),
  
  query('departmentId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid department ID'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  
  query('minAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be non-negative'),
  
  query('maxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be non-negative')
];

module.exports = {
  createRequestValidator,
  updateRequestValidator,
  approvalValidator,
  budgetLineValidator,
  topUpBudgetValidator,
  paginationValidator,
  filterValidator
};
