const express = require('express');
const { authenticateUser, rateLimit, setCorsHeaders, auditLog } = require('../middleware/securityMiddleware');
const traineeService = require('../services/traineePayrollService');

const router = express.Router();
router.use(setCorsHeaders);
router.use(authenticateUser);
router.use(rateLimit(60, 60_000));
router.use(auditLog);

const mapServiceErrorToStatus = (error) => {
  switch (error?.code) {
    case 'invalid-argument':
      return 400;
    case 'not-found':
      return 404;
    case 'permission-denied':
      return 403;
    default:
      return 500;
  }
};

// Delete an entire trainee payroll period
router.post('/delete-period', async (req, res) => {
  try {
    const result = await traineeService.deleteTraineePayrollPeriod(req.body);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message, code: error.code || 'internal', details: error.details });
  }
});

// Delete a trainee payroll record for an employee in a period
router.post('/delete-employee', async (req, res) => {
  try {
    const result = await traineeService.deleteTraineePayrollEmployee(req.body);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message, code: error.code || 'internal', details: error.details });
  }
});

module.exports = router;

