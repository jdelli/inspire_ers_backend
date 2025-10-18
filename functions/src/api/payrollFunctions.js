const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const payrollService = require('../services/payrollService');
const taxService = require('../services/taxService');
const deductionService = require('../services/deductionService');
const thirteenthMonthService = require('../services/thirteenthMonthService');

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

router.post('/calculate', async (req, res) => {
  try {
    const result = await payrollService.calculatePayroll(req.body, { request: req });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to calculate payroll.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const result = await payrollService.bulkCalculatePayroll(req.body, { request: req });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to process bulk payroll.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

router.post('/statutory', async (req, res) => {
  try {
    const deductions = await taxService.computeStatutoryDeductions(req.body);
    res.json(deductions);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to compute deductions.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

router.post('/attendance-adjustments', async (req, res) => {
  try {
    const adjustments = await deductionService.calculateAttendanceAdjustments(req.body);
    res.json(adjustments);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to compute attendance adjustments.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

router.post('/thirteenth-month', async (req, res) => {
  try {
    const payout = await thirteenthMonthService.computeThirteenthMonthPay(req.body);
    res.json(payout);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to compute 13th month pay.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

// Delete all payroll records for a period (optional cutoff filters)
router.post('/delete-period', async (req, res) => {
  try {
    const result = await payrollService.deletePayrollByPeriod(req.body);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to delete payroll period.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

// Delete payroll records for a specific employee in a period
router.post('/delete-employee', async (req, res) => {
  try {
    const result = await payrollService.deletePayrollByEmployee(req.body);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to delete employee payroll.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

module.exports = router;
