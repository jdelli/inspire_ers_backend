const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const reportService = require('../services/reportService');

const router = express.Router();

router.use(authMiddleware);
router.use(rateLimitMiddleware);

router.post('/payroll', async (req, res) => {
  try {
    const report = await reportService.generatePayrollReport(req.body);
    res.json(report);
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

router.post('/government-forms', async (req, res) => {
  try {
    const forms = await reportService.generateGovernmentForms(req.body);
    res.json(forms);
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

module.exports = router;
