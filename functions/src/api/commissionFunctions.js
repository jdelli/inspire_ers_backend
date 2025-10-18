const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const commissionService = require('../services/commissionService');

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
    const payload = req.body || {};
    const hasMultiple = Array.isArray(payload.entries) || Array.isArray(payload.commissions);
    const result = hasMultiple
      ? await commissionService.calculateCommissions(payload, { request: req })
      : await commissionService.calculateCommission(payload, { request: req });

    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      message: error.message || 'Failed to calculate commission.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

module.exports = router;
