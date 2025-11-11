const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const { recordActivity } = require('../services/activityLogService');
const pettyCashService = require('../services/pettyCashService');

// Initialize Firebase Admin (align with other API modules)
initializeFirebaseAdmin();

const router = express.Router();

const logActivitySafe = async (payload = {}) => {
  try {
    await recordActivity(payload);
  } catch (error) {
    console.error('Failed to record petty cash activity log:', error);
  }
};

const buildActivityContext = (req) => ({
  user: req.user || null,
  request: req.activityContext || {},
});

// ---------------------------------------------------------------------------
// List petty cash records
router.get('/', async (req, res) => {
  try {
    const { companyId, type, from, to, limit } = req.query;
    const result = await pettyCashService.listPettyCash({ companyId, type, from, to, limit });
    return res.json(result);
  } catch (error) {
    console.error('Error listing petty cash:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get single record
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const record = await pettyCashService.getPettyCashById(id);
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, record });
  } catch (error) {
    console.error('Error getting petty cash record:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create record
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const user = req.user || {};
    const result = await pettyCashService.createPettyCash(payload, {
      userId: user.uid || null,
      email: user.email || null,
    });

    await logActivitySafe({
      module: 'finance',
      action: 'PETTY_CASH_CREATED',
      companyId: payload.companyId || null,
      entityType: 'pettyCash',
      entityId: result.id,
      summary: `${payload.type || 'record'} created on ${payload.date} amount ${payload.amount}`,
      metadata: { ...payload, id: result.id },
      context: buildActivityContext(req),
    });

    return res.json({ success: true, id: result.id });
  } catch (error) {
    const status = error.code === 'invalid-argument' ? 400 : 500;
    console.error('Error creating petty cash record:', error);
    return res.status(status).json({ success: false, error: error.message });
  }
});

// Update record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const user = req.user || {};

    const result = await pettyCashService.updatePettyCash(id, payload, {
      userId: user.uid || null,
      email: user.email || null,
    });

    // Load record to capture companyId/type/date/amount for activity context
    try {
      const updated = await pettyCashService.getPettyCashById(id);
      await logActivitySafe({
        module: 'finance',
        action: 'PETTY_CASH_UPDATED',
        companyId: (updated && updated.companyId) || payload.companyId || null,
        entityType: 'pettyCash',
        entityId: id,
        summary: `record updated: ${updated?.type || payload.type || ''} ${updated?.date || ''} amount ${updated?.amount ?? ''}`,
        metadata: { id, ...payload },
        context: buildActivityContext(req),
      });
    } catch (e) {
      // non-fatal
    }

    return res.json(result);
  } catch (error) {
    const status = error.code === 'invalid-argument' ? 400 : error.code === 'not-found' ? 404 : 500;
    console.error('Error updating petty cash record:', error);
    return res.status(status).json({ success: false, error: error.message });
  }
});

// Delete record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch before delete for context
    let existing = null;
    try { existing = await pettyCashService.getPettyCashById(id); } catch (_) {}

    const result = await pettyCashService.deletePettyCash(id);

    await logActivitySafe({
      module: 'finance',
      action: 'PETTY_CASH_DELETED',
      companyId: existing?.companyId || null,
      entityType: 'pettyCash',
      entityId: id,
      summary: `record deleted: ${existing?.type || ''} ${existing?.date || ''} amount ${existing?.amount ?? ''}`,
      metadata: existing || { id },
      context: buildActivityContext(req),
    });

    return res.json(result);
  } catch (error) {
    const status = error.code === 'not-found' ? 404 : 500;
    console.error('Error deleting petty cash record:', error);
    return res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;

