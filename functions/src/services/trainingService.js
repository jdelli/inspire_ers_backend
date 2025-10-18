const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') throw new Error('Firestore is not initialized');
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;

const createServiceError = (code, message, details) => {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
};

const safeString = (v) => (v == null ? '' : String(v).trim());

async function listTrainingRecords(payload = {}) {
  const db = firestore();
  const { managerId, companyId } = payload;
  let q = db.collection('trainingRecords');
  const snap = await q.get();
  let records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (safeString(managerId)) {
    records = records.filter((r) => safeString(r.managerId) === safeString(managerId));
  }
  if (safeString(companyId)) {
    records = records.filter((r) => safeString(r.companyId) === safeString(companyId));
  }
  return { success: true, records };
}

async function createTrainingRecord(payload = {}, options = {}) {
  const db = firestore();
  const data = { ...payload };
  data.createdAt = FieldValue.serverTimestamp();
  data.updatedAt = FieldValue.serverTimestamp();
  if (options.userId) data.createdBy = options.userId;
  const ref = await db.collection('trainingRecords').add(data);
  return { success: true, id: ref.id };
}

async function updateTrainingRecord(id, payload = {}, options = {}) {
  const db = firestore();
  const docRef = db.collection('trainingRecords').doc(safeString(id));
  const snap = await docRef.get();
  if (!snap.exists) throw createServiceError('not-found', 'Training record not found');
  const data = { ...payload, updatedAt: FieldValue.serverTimestamp() };
  if (options.userId) data.updatedBy = options.userId;
  await docRef.set(data, { merge: true });
  return { success: true };
}

async function deleteTrainingRecord(id, options = {}) {
  const db = firestore();
  const docRef = db.collection('trainingRecords').doc(safeString(id));
  const snap = await docRef.get();
  if (!snap.exists) throw createServiceError('not-found', 'Training record not found');
  const recycled = {
    ...snap.data(),
    originalId: snap.id,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: options.userId || null,
    deletedByEmail: options.email || null,
  };
  await db.collection('recycledTrainees').add(recycled);
  await docRef.delete();
  return { success: true };
}

module.exports = {
  listTrainingRecords,
  createTrainingRecord,
  updateTrainingRecord,
  deleteTrainingRecord,
};

