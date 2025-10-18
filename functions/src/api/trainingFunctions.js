const express = require('express');
const { authenticateUser, rateLimit, setCorsHeaders, auditLog } = require('../middleware/securityMiddleware');
const trainingService = require('../services/trainingService');

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

router.get('/records', async (req, res) => {
  try {
    const result = await trainingService.listTrainingRecords(req.query);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to list training records', code: error.code || 'internal' });
  }
});

router.post('/records', async (req, res) => {
  try {
    const result = await trainingService.createTrainingRecord(req.body, { userId: req.user?.uid, email: req.user?.email });
    res.status(201).json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to create training record', code: error.code || 'internal' });
  }
});

router.post('/records/:id/update', async (req, res) => {
  try {
    const result = await trainingService.updateTrainingRecord(req.params.id, req.body, { userId: req.user?.uid, email: req.user?.email });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to update training record', code: error.code || 'internal' });
  }
});

router.post('/records/:id/delete', async (req, res) => {
  try {
    const result = await trainingService.deleteTrainingRecord(req.params.id, { userId: req.user?.uid, email: req.user?.email });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({ success: false, message: error.message || 'Failed to delete training record', code: error.code || 'internal' });
  }
});

module.exports = router;

