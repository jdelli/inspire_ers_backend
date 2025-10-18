const express = require('express');
const admin = require('firebase-admin');
const { authenticateUser, rateLimit, setCorsHeaders, auditLog } = require('../middleware/securityMiddleware');

const router = express.Router();
router.use(setCorsHeaders);
router.use(authenticateUser);
router.use(rateLimit(60, 60_000));
router.use(auditLog);

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// POST /history
// Body: { personType: 'trainee'|'employee', payload: {...} }
router.post('/history', async (req, res, next) => {
  try {
    const { personType = 'trainee', payload = {} } = req.body || {};
    const collectionName = personType === 'employee' ? 'payslip_history' : 'trainee_payslip_history';

    const docData = {
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: req.user?.uid || null,
      createdByEmail: req.user?.email || null,
    };

    const ref = await db.collection(collectionName).add(docData);
    res.status(201).json({ success: true, id: ref.id });
  } catch (err) {
    next(err);
  }
});

// GET /history?companyId=...&employeeId=...&personType=trainee
router.get('/history', async (req, res, next) => {
  try {
    const { personType = 'trainee', companyId, employeeId } = req.query;
    const collectionName = personType === 'employee' ? 'payslip_history' : 'trainee_payslip_history';
    let q = db.collection(collectionName);
    if (companyId) q = q.where('companyId', '==', companyId);
    if (employeeId) q = q.where(personType === 'employee' ? 'employeeId' : 'traineeId', '==', employeeId);
    const snap = await q.get();
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ success: true, records });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

