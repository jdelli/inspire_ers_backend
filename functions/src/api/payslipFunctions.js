const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const { ensureTransport, getMailConfigStatus, getFromAddress } = require('../services/mailService');

const router = express.Router();

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();
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

// POST /send
// Body: { messages: [{ to, subject, html }], options?: { saveHistory?: boolean, personType?: 'employee'|'trainee' } }
// Sends emails via server-side SMTP using Nodemailer
router.post('/send', async (req, res, next) => {
  try {
    const { messages = [], options = {} } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'messages[] is required' });
    }

    const transporter = await ensureTransport();
    const from = getFromAddress();
    if (!transporter) {
      const status = getMailConfigStatus();
      return res.status(500).json({ success: false, message: 'Mail transport not configured on server', status });
    }

    const results = await Promise.allSettled(
      messages.map((m, idx) => {
        const to = (m && m.to) || m?.recipient || m?.email;
        const subject = (m && m.subject) || '(no subject)';
        const html = (m && m.html) || '<p>(empty)</p>';
        if (!to) {
          return Promise.reject(new Error(`Message ${idx} missing to`));
        }
        return transporter.sendMail({ from, to, subject, html });
      })
    );

    const failures = [];
    let sent = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        sent += 1;
      } else {
        failures.push({ index: i, to: messages[i]?.to || null, reason: r.reason?.message || String(r.reason) });
      }
    });

    // Optionally write to history collection if requested
    const saveHistory = Boolean(options.saveHistory);
    if (saveHistory) {
      try {
        const collectionName = options.personType === 'employee' ? 'payslip_history' : 'trainee_payslip_history';
        await db.collection(collectionName).add({
          type: 'server_email_send',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          counts: { total: messages.length, sent, failed: failures.length },
          failures,
          context: {
            route: 'payslips/send',
            from,
          },
        });
      } catch (e) {
        // non-fatal
        console.warn('payslips/send: failed to record history:', e?.message || e);
      }
    }

    const info = getMailConfigStatus();
    return res.json({ success: true, total: messages.length, sent, failed: failures.length, failures, transport: info });
  } catch (err) {
    next(err);
  }
});

