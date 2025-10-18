const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const reportService = require('../services/reportService');

const router = express.Router();

router.use(authMiddleware);
router.use(rateLimitMiddleware);

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
 * POST /reports/payroll
 * Generate payroll report for specified period and filters
 * Body: { companyId, startDate, endDate, department?, employeeId?, pageSize?, pageNumber? }
 */
router.post('/payroll', async (req, res) => {
  try {
    const result = await reportService.generatePayrollReport(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate payroll report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /reports/payroll
 * Generate payroll report via query parameters
 * Query: companyId, startDate, endDate, department?, employeeId?, pageSize?, pageNumber?
 */
router.get('/payroll', async (req, res) => {
  try {
    const result = await reportService.generatePayrollReport(req.query, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate payroll report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /reports/company
 * Generate company-wide report with department aggregation
 * Body: { companyId, startDate, endDate }
 */
router.post('/company', async (req, res) => {
  try {
    const result = await reportService.generateCompanyReport(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate company report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /reports/company
 * Generate company-wide report via query parameters
 * Query: companyId, startDate, endDate
 */
router.get('/company', async (req, res) => {
  try {
    const result = await reportService.generateCompanyReport(req.query, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate company report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /reports/attendance
 * Generate attendance report with statistics
 * Body: { companyId, startDate, endDate, department? }
 */
router.post('/attendance', async (req, res) => {
  try {
    const result = await reportService.generateAttendanceReport(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate attendance report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /reports/attendance
 * Generate attendance report via query parameters
 * Query: companyId, startDate, endDate, department?
 */
router.get('/attendance', async (req, res) => {
  try {
    const result = await reportService.generateAttendanceReport(req.query, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate attendance report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /reports/tax
 * Generate tax and deductions report
 * Body: { companyId, startDate, endDate }
 */
router.post('/tax', async (req, res) => {
  try {
    const result = await reportService.generateTaxReport(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate tax report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /reports/tax
 * Generate tax report via query parameters
 * Query: companyId, startDate, endDate
 */
router.get('/tax', async (req, res) => {
  try {
    const result = await reportService.generateTaxReport(req.query, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate tax report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /reports/trainee-payroll
 * Generate trainee payroll report
 * Body: { companyId, startDate, endDate }
 */
router.post('/trainee-payroll', async (req, res) => {
  try {
    const result = await reportService.generateTraineePayrollReport(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate trainee payroll report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /reports/trainee-payroll
 * Generate trainee payroll report via query parameters
 * Query: companyId, startDate, endDate
 */
router.get('/trainee-payroll', async (req, res) => {
  try {
    const result = await reportService.generateTraineePayrollReport(req.query, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate trainee payroll report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

module.exports = router;
