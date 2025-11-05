const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const { recordActivity } = require('../services/activityLogService');

const admin = initializeFirebaseAdmin();
const db = admin.firestore();
const router = express.Router();

console.log('🎯 [holidayFunctions] Router initialized:', !!router);
console.log('🎯 [holidayFunctions] Router stack:', router.stack ? router.stack.length : 'no stack');

const logActivitySafe = async (payload = {}) => {
  try {
    await recordActivity(payload);
  } catch (error) {
    console.error('Failed to record holiday activity log:', error);
  }
};

// Validation helper
function validateHolidayInput(body) {
  const errors = [];
  const { companyId, date, name } = body;
  if (!companyId) errors.push('companyId is required');
  if (!date) errors.push('date is required');
  if (!name) errors.push('name is required');
  if (date) {
    // Expect YYYY-MM-DD
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (!valid) errors.push('date must be YYYY-MM-DD');
  }
  return errors;
}

// List holidays (optionally by date range)
router.get('/', async (req, res) => {
  try {
    const { companyId, from, to } = req.query;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'companyId is required' });
    }

    let query = db.collection('companyHolidays').where('companyId', '==', companyId);

    if (from && to) {
      query = query.where('date', '>=', from).where('date', '<=', to);
    }

    const snap = await query.get();
    const holidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    res.json({ success: true, holidays });
  } catch (error) {
    console.error('❌ Error listing holidays:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create holiday
router.post('/', async (req, res) => {
  try {
    const { companyId, date, name, payable = false, notes = '' } = req.body;
    const errors = validateHolidayInput({ companyId, date, name });
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

    const holiday = {
      companyId,
      date,
      name,
      payable: !!payable,
      notes,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('companyHolidays').add(holiday);

    await logActivitySafe({
      module: 'hr',
      action: 'HOLIDAY_CREATED',
      companyId,
      entityType: 'holiday',
      entityId: docRef.id,
      summary: `Holiday created: ${date} — ${name} (${payable ? 'payable' : 'not payable'})`,
      metadata: { date, name, payable },
    });

    // Best-effort: mark overlapping attendance summaries to recompute
    await markSummariesForRecompute(companyId, date);

    res.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('❌ Error creating holiday:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update holiday
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId, date, name, payable, notes } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });

    const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (companyId) update.companyId = companyId;
    if (date) update.date = date;
    if (name) update.name = name;
    if (typeof payable === 'boolean') update.payable = payable;
    if (typeof notes === 'string') update.notes = notes;

    await db.collection('companyHolidays').doc(id).set(update, { merge: true });

    // Load updated doc for activity context
    const newDoc = await db.collection('companyHolidays').doc(id).get();
    const data = newDoc.data() || {};

    await logActivitySafe({
      module: 'hr',
      action: 'HOLIDAY_UPDATED',
      companyId: data.companyId || companyId || null,
      entityType: 'holiday',
      entityId: id,
      summary: `Holiday updated: ${data.date} — ${data.name} (${data.payable ? 'payable' : 'not payable'})`,
      metadata: { ...data },
    });

    // Best-effort: mark overlapping attendance summaries to recompute
    if (data.companyId && data.date) {
      await markSummariesForRecompute(data.companyId, data.date);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error updating holiday:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete holiday
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });

    const doc = await db.collection('companyHolidays').doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, error: 'Holiday not found' });

    const data = doc.data();
    await db.collection('companyHolidays').doc(id).delete();

    await logActivitySafe({
      module: 'hr',
      action: 'HOLIDAY_DELETED',
      companyId: data.companyId || null,
      entityType: 'holiday',
      entityId: id,
      summary: `Holiday deleted: ${data.date} — ${data.name}`,
      metadata: { ...data },
    });

    // Best-effort: mark overlapping attendance summaries to recompute
    if (data.companyId && data.date) {
      await markSummariesForRecompute(data.companyId, data.date);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting holiday:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Internal: mark summaries containing the given date for recompute
async function markSummariesForRecompute(companyId, date) {
  try {
    // Firestore limitation: single inequality field; use endDate >= date, filter startDate in memory
    const snap = await db
      .collection('attendanceSummaries')
      .where('companyId', '==', companyId)
      .where('endDate', '>=', date)
      .get();

    const affected = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => (s.startDate || '').toString() <= date && (s.endDate || '').toString() >= date);

    if (!affected.length) return;

    const batch = db.batch();
    affected.forEach((s) => {
      const ref = db.collection('attendanceSummaries').doc(s.id);
      batch.update(ref, { needsRecompute: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();

    await logActivitySafe({
      module: 'hr',
      action: 'ATTENDANCE_SUMMARY_MARKED_FOR_RECOMPUTE',
      companyId,
      entityType: 'company',
      entityId: companyId,
      summary: `Marked ${affected.length} summaries for recompute due to holiday change on ${date}`,
      metadata: { date, count: affected.length },
    });
  } catch (e) {
    console.error('⚠️ Failed to mark summaries for recompute:', e);
  }
}

console.log('🎯 [holidayFunctions] About to export router with', router.stack ? router.stack.length : 0, 'routes');
module.exports = router;
