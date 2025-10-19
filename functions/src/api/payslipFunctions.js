const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

// Initialize Firebase Admin if not already initialized
if (!global.firebaseAdminInitialized) {
  try {
    const serviceAccount = require('../../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    global.firebaseAdminInitialized = true;
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

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

