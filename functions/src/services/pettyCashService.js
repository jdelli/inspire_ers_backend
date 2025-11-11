const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;

const COLLECTION = 'pettyCash';

const createServiceError = (code, message, details) => {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
};

const safeString = (v) => (v == null ? '' : String(v).trim());
const toNumber = (v) => {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const isValidDateStr = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validateBase(payload = {}) {
  const errors = [];
  const { type, companyId, date, amount, reference } = payload;

  if (type !== 'expense' && type !== 'replenish') {
    errors.push("type must be 'expense' or 'replenish'");
  }
  if (!safeString(companyId)) errors.push('companyId is required');
  if (!isValidDateStr(date)) errors.push('date must be YYYY-MM-DD');
  const amt = toNumber(amount);
  if (!Number.isFinite(amt)) errors.push('amount must be a number');
  if (amt < 0) errors.push('amount cannot be negative');
  if (!safeString(reference)) errors.push('reference is required');

  return errors;
}

function validateExpense(payload = {}) {
  const errors = [];
  if (!safeString(payload.category)) errors.push('category is required for expense');
  if (!safeString(payload.description)) errors.push('description is required for expense');
  return errors;
}

function validateReplenish(payload = {}) {
  const errors = [];
  if (!safeString(payload.notes)) errors.push('notes is required for replenish');
  return errors;
}

async function listPettyCash(filters = {}) {
  const db = firestore();
  const { companyId, type, from, to, limit } = filters;

  let q = db.collection(COLLECTION);
  if (safeString(companyId)) q = q.where('companyId', '==', safeString(companyId));
  if (safeString(type)) q = q.where('type', '==', safeString(type));
  if (isValidDateStr(from)) q = q.where('date', '>=', from);
  if (isValidDateStr(to)) q = q.where('date', '<=', to);
  q = q.orderBy('date', 'desc');
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    q = q.limit(Number(limit));
  }

  const snap = await q.get();
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { success: true, records };
}

async function getPettyCashById(id) {
  const db = firestore();
  const ref = db.collection(COLLECTION).doc(safeString(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function createPettyCash(payload = {}, options = {}) {
  const baseErrors = validateBase(payload);
  if (baseErrors.length) throw createServiceError('invalid-argument', baseErrors.join('; '), baseErrors);

  if (payload.type === 'expense') {
    const e = validateExpense(payload);
    if (e.length) throw createServiceError('invalid-argument', e.join('; '), e);
  }
  if (payload.type === 'replenish') {
    const e = validateReplenish(payload);
    if (e.length) throw createServiceError('invalid-argument', e.join('; '), e);
  }

  const db = firestore();
  const ref = db.collection(COLLECTION).doc();

  const record = {
    id: ref.id,
    companyId: safeString(payload.companyId),
    type: safeString(payload.type),
    date: safeString(payload.date),
    amount: Number(toNumber(payload.amount)),
    reference: safeString(payload.reference),
    category: payload.type === 'expense' ? safeString(payload.category) : undefined,
    description: payload.type === 'expense' ? safeString(payload.description) : undefined,
    notes: payload.type === 'replenish' ? safeString(payload.notes) : undefined,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: options.userId || null,
    createdByEmail: options.email || null,
    updatedBy: options.userId || null,
    updatedByEmail: options.email || null,
  };

  // remove undefined fields
  Object.keys(record).forEach((k) => record[k] === undefined && delete record[k]);

  await ref.set(record);
  return { success: true, id: ref.id };
}

async function updatePettyCash(id, payload = {}, options = {}) {
  const db = firestore();
  const ref = db.collection(COLLECTION).doc(safeString(id));
  const snap = await ref.get();
  if (!snap.exists) throw createServiceError('not-found', 'Petty cash record not found');

  const update = { updatedAt: FieldValue.serverTimestamp() };
  if (payload.companyId != null) update.companyId = safeString(payload.companyId);
  if (payload.type != null) {
    const t = safeString(payload.type);
    if (t !== 'expense' && t !== 'replenish') throw createServiceError('invalid-argument', "type must be 'expense' or 'replenish'");
    update.type = t;
  }
  if (payload.date != null) {
    if (!isValidDateStr(payload.date)) throw createServiceError('invalid-argument', 'date must be YYYY-MM-DD');
    update.date = safeString(payload.date);
  }
  if (payload.amount != null) {
    const amt = toNumber(payload.amount);
    if (!Number.isFinite(amt)) throw createServiceError('invalid-argument', 'amount must be a number');
    if (amt < 0) throw createServiceError('invalid-argument', 'amount cannot be negative');
    update.amount = Number(amt);
  }
  if (payload.reference != null) update.reference = safeString(payload.reference);
  if (payload.category != null) update.category = safeString(payload.category);
  if (payload.description != null) update.description = safeString(payload.description);
  if (payload.notes != null) update.notes = safeString(payload.notes);

  if (options.userId) update.updatedBy = options.userId;
  if (options.email) update.updatedByEmail = options.email;

  await ref.set(update, { merge: true });
  return { success: true };
}

async function deletePettyCash(id) {
  const db = firestore();
  const ref = db.collection(COLLECTION).doc(safeString(id));
  const snap = await ref.get();
  if (!snap.exists) throw createServiceError('not-found', 'Petty cash record not found');
  await ref.delete();
  return { success: true };
}

module.exports = {
  listPettyCash,
  getPettyCashById,
  createPettyCash,
  updatePettyCash,
  deletePettyCash,
};

