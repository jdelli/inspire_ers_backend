const express = require('express');
const { getFirestore } = require('firebase-admin/firestore');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const db = getFirestore();

// Middleware to ensure user is authenticated
router.use(authMiddleware);

/**
 * GET / - List holidays for a company
 * Query params: companyId, from, to
 */
router.get('/', async (req, res) => {
  const { companyId, from, to } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  try {
    let query = db.collection('companyHolidays').where('companyId', '==', companyId);

    if (from) {
      query = query.where('date', '>=', from);
    }
    if (to) {
      query = query.where('date', '<=', to);
    }

    const snapshot = await query.orderBy('date').get();

    if (snapshot.empty) {
      return res.status(200).json({ success: true, holidays: [] });
    }

    const holidays = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ success: true, holidays });
  } catch (error) {
    console.error('Error listing holidays:', error);
    return res.status(500).json({ success: false, message: 'Failed to list holidays', error: error.message });
  }
});

/**
 * POST / - Create a new holiday
 * Body: { companyId, date, name, payable, notes? }
 */
router.post('/', async (req, res) => {
  const { companyId, date, name, payable = false, notes = '' } = req.body;

  if (!companyId || !date || !name) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: companyId, date, and name are required',
    });
  }

  try {
    const normalizedDate = new Date(date).toISOString().slice(0, 10);

    // Check for duplicates
    const existingHoliday = await db
      .collection('companyHolidays')
      .where('companyId', '==', companyId)
      .where('date', '==', normalizedDate)
      .limit(1)
      .get();

    if (!existingHoliday.empty) {
      return res.status(409).json({ success: false, message: 'This holiday date already exists for this company.' });
    }

    const newHoliday = {
      companyId,
      date: normalizedDate,
      name,
      payable,
      notes,
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection('companyHolidays').add(newHoliday);
    return res.status(201).json({ success: true, id: docRef.id, ...newHoliday });
  } catch (error) {
    console.error('Error creating holiday:', error);
    return res.status(500).json({ success: false, message: 'Failed to create holiday', error: error.message });
  }
});

/**
 * PUT /:id - Update a holiday
 * Body: { date, name, payable, notes? }
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { date, name, payable, notes } = req.body;

  try {
    const holidayRef = db.collection('companyHolidays').doc(id);
    const doc = await holidayRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }

    const updateData = {};
    if (date) updateData.date = new Date(date).toISOString().slice(0, 10);
    if (name) updateData.name = name;
    if (typeof payable === 'boolean') updateData.payable = payable;
    if (notes) updateData.notes = notes;
    updateData.updatedAt = new Date().toISOString();

    await holidayRef.update(updateData);
    return res.status(200).json({ success: true, id, ...updateData });
  } catch (error) {
    console.error(`Error updating holiday ${id}:`, error);
    return res.status(500).json({ success: false, message: 'Failed to update holiday', error: error.message });
  }
});

/**
 * DELETE /:id - Delete a holiday
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const holidayRef = db.collection('companyHolidays').doc(id);
    const doc = await holidayRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Holiday not found' });
    }

    await holidayRef.delete();
    return res.status(200).json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    console.error(`Error deleting holiday ${id}:`, error);
    return res.status(500).json({ success: false, message: 'Failed to delete holiday', error: error.message });
  }
});

module.exports = router;