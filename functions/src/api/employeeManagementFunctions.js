const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const {
  authenticateUser,
  validateCompanyAccess,
  rateLimit,
  validateInput,
  sanitizeInput,
  auditLog,
  setCorsHeaders,
  errorHandler
} = require('../middleware/securityMiddleware');
const employeeManagementService = require('../services/employeeManagementService');

const router = express.Router();

// Phase 6: Apply security middleware
router.use(setCorsHeaders);
router.use(authenticateUser);
router.use(rateLimit(50, 60000)); // 50 requests per minute
router.use(validateCompanyAccess);
router.use(auditLog);

const mapServiceErrorToStatus = (error) => {
  switch (error?.code) {
    case 'invalid-argument':
      return 400;
    case 'not-found':
      return 404;
    case 'failed-precondition':
      return 412;
    case 'permission-denied':
      return 403;
    default:
      return 500;
  }
};

/**
 * POST /create
 * Creates a new employee
 * Body: Employee data (firstName, lastName, email, etc.)
 * Phase 6: Input validation and sanitization
 */
const employeeCreateSchema = {
  firstName: { required: true, type: 'string', minLength: 1, maxLength: 100 },
  lastName: { required: true, type: 'string', minLength: 1, maxLength: 100 },
  email: { required: true, type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxLength: 255 },
  companyId: { required: true, type: 'string' },
  basicPay: { required: false, type: 'number', min: 0 },
  position: { required: false, type: 'string', maxLength: 100 }
};

router.post('/create',
  validateInput(employeeCreateSchema),
  async (req, res) => {
    try {
      // Phase 6: Sanitize inputs
      const sanitizedData = sanitizeInput(req.body);

      const result = await employeeManagementService.createEmployee(sanitizedData, {
        userId: req.user?.uid,
        email: req.user?.email,
        companyId: req.companyId
      });
      res.status(201).json(result);
    } catch (error) {
      const status = mapServiceErrorToStatus(error);
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to create employee.',
        code: error.code || 'internal',
        details: error.details,
      });
    }
  }
);

/**
 * POST /:employeeId/update
 * Updates an existing employee
 * Params: employeeId
 * Body: Employee data to update
 */
router.post('/:employeeId/update', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await employeeManagementService.updateEmployee(employeeId, req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to update employee.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /:employeeId
 * Retrieves employee details by ID
 * Params: employeeId
 */
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await employeeManagementService.getEmployee(employeeId);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to retrieve employee.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /:employeeId/delete
 * Deletes an employee (soft delete by default)
 * Params: employeeId
 * Body: { reason: string, hardDelete: boolean }
 */
router.post('/:employeeId/delete', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await employeeManagementService.deleteEmployee(employeeId, req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to delete employee.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /:employeeId/restore
 * Restores a deleted employee from recycle bin
 * Params: employeeId
 */
router.post('/:employeeId/restore', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await employeeManagementService.restoreEmployee(employeeId, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to restore employee.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /list
 * Lists all employees with pagination and filtering
 * Query params: page, pageSize, status, department, searchTerm, companyId
 */
router.get('/list', async (req, res) => {
  try {
    const result = await employeeManagementService.listEmployees(req.query.companyId, {
      pageSize: req.query.pageSize,
      pageNumber: req.query.page,
      status: req.query.status,
      department: req.query.department,
      searchTerm: req.query.searchTerm,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to list employees.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /bulk-delete
 * Bulk deletes multiple employees
 * Body: { employeeIds: string[], reason: string, hardDelete: boolean }
 */
router.post('/bulk-delete', async (req, res) => {
  try {
    const { employeeIds, reason, hardDelete } = req.body;
    const result = await employeeManagementService.bulkDeleteEmployees(employeeIds, { reason, hardDelete }, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to bulk delete employees.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

module.exports = router;
