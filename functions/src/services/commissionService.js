const admin = require('../utils/firebaseAdmin');

const COMMISSION_COLLECTION_ROOT = 'Commissions';
const COMMISSION_SUBCOLLECTION = 'commissions';
const EMPLOYEES_COLLECTION = 'employees';
const AGENTS_COLLECTION_ROOT = 'agents';
const AGENTS_SUBCOLLECTION = 'companyAgents';

const COMMISSION_TYPE_DEFAULTS = Object.freeze({
  'Sales Commission': { rate: 5 },
  'Referral Bonus': { rate: 3 },
  'Performance Bonus': { rate: 7.5 },
  'Special Commission': { rate: 10 },
  'Project Commission': { rate: 8 },
});

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;

const createServiceError = (code, message, details) => {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const parseRatePercent = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric > 1 ? numeric : numeric * 100;
};

const resolveDefaultRate = (type) => {
  const settings = COMMISSION_TYPE_DEFAULTS[type] || COMMISSION_TYPE_DEFAULTS['Sales Commission'];
  return settings?.rate || 0;
};

const resolveCommissionRate = (entry, profile) => {
  const explicitRate = parseRatePercent(entry.commissionRate ?? entry.rate ?? entry.ratePercent);
  if (explicitRate !== null) {
    return explicitRate;
  }

  const profileRate = parseRatePercent(profile?.commissionRate);
  if (profileRate !== null) {
    return profileRate;
  }

  const typeRate = resolveDefaultRate(entry.type);
  return parseRatePercent(typeRate) || 0;
};

const resolveBaseCommission = (entry, profile) => {
  if (entry.baseCommission !== undefined) {
    return roundCurrency(entry.baseCommission);
  }
  return roundCurrency(profile?.baseCommission || 0);
};

const resolveBonusCommission = (entry, profile) => {
  if (entry.bonusCommission !== undefined) {
    return roundCurrency(entry.bonusCommission);
  }
  return roundCurrency(profile?.bonusCommission || 0);
};

const resolveAdjustments = (adjustments) => {
  if (!adjustments) {
    return { total: 0, breakdown: null };
  }

  if (typeof adjustments === 'number') {
    return { total: roundCurrency(adjustments), breakdown: null };
  }

  if (typeof adjustments !== 'object') {
    return { total: 0, breakdown: null };
  }

  let total = 0;
  const breakdown = {};
  Object.entries(adjustments).forEach(([key, value]) => {
    const numeric = roundCurrency(value);
    breakdown[key] = numeric;
    total += numeric;
  });
  return { total: roundCurrency(total), breakdown };
};

const resolveCommissionableAmount = (entry, profile) => {
  if (entry.commissionableAmount !== undefined) {
    return roundCurrency(entry.commissionableAmount);
  }
  if (entry.salesAmount !== undefined) {
    return roundCurrency(entry.salesAmount);
  }
  if (entry.baseAmount !== undefined) {
    return roundCurrency(entry.baseAmount);
  }
  if (entry.amount !== undefined) {
    return roundCurrency(entry.amount);
  }
  if (profile?.monthlyTarget) {
    return roundCurrency(profile.monthlyTarget);
  }
  return 0;
};

const resolveDateString = (value) => {
  if (!value) {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createServiceError('invalid-argument', 'Invalid commission date provided.');
  }
  return parsed.toISOString().slice(0, 10);
};

const loadAgentProfile = async (companyId, agentId) => {
  if (!agentId) {
    return null;
  }

  const db = firestore();
  const agentRef = db.collection(AGENTS_COLLECTION_ROOT).doc(companyId).collection(AGENTS_SUBCOLLECTION).doc(agentId);
  const snapshot = await agentRef.get();
  if (!snapshot.exists) {
    return null;
  }
  return { id: snapshot.id, agentId: snapshot.id, ...snapshot.data() };
};

const loadEmployeeProfile = async (companyId, employeeId) => {
  if (!employeeId) {
    return null;
  }

  const db = firestore();
  let snapshot = await db.collection(EMPLOYEES_COLLECTION).doc(employeeId).get();

  if (!snapshot.exists) {
    const nestedRef = db.collection('companies').doc(companyId).collection(EMPLOYEES_COLLECTION).doc(employeeId);
    snapshot = await nestedRef.get();
  }

  if (!snapshot.exists) {
    return null;
  }

  return { id: snapshot.id, employeeId: snapshot.id, ...snapshot.data() };
};

const formatPersonName = (profile, fallback) => {
  if (profile?.employeeName) {
    return profile.employeeName;
  }
  if (profile?.agentName) {
    return profile.agentName;
  }
  const firstName = profile?.firstName || '';
  const lastName = profile?.lastName || '';
  const combined = `${firstName} ${lastName}`.trim();
  return combined || fallback || '';
};

const buildCommissionCollectionRef = (companyId) => {
  return firestore()
    .collection(COMMISSION_COLLECTION_ROOT)
    .doc(companyId)
    .collection(COMMISSION_SUBCOLLECTION);
};

const prepareCommissionRecord = async ({ companyId, entry, options = {} }) => {
  const personType = entry.personType || (entry.employeeId ? 'employee' : 'agent');

  if (!personType || !['employee', 'agent'].includes(personType)) {
    throw createServiceError('invalid-argument', 'personType must be "employee" or "agent".');
  }

  if (!entry.type) {
    throw createServiceError('invalid-argument', 'Commission type is required.');
  }

  const baseCollection = buildCommissionCollectionRef(companyId);

  let profile = null;
  if (personType === 'employee') {
    const employeeId = entry.employeeId || entry.referenceId;
    if (!employeeId) {
      throw createServiceError('invalid-argument', 'employeeId is required for employee commissions.');
    }
    profile = await loadEmployeeProfile(companyId, employeeId);
    if (!profile) {
      throw createServiceError('not-found', `Employee ${employeeId} not found.`);
    }
  } else {
    const agentId = entry.agentId || entry.referenceId;
    if (!agentId) {
      throw createServiceError('invalid-argument', 'agentId is required for agent commissions.');
    }
    profile = await loadAgentProfile(companyId, agentId);
    if (!profile) {
      throw createServiceError('not-found', `Agent ${agentId} not found.`);
    }
  }

  const commissionableAmount = resolveCommissionableAmount(entry, profile);
  const ratePercent = resolveCommissionRate(entry, profile);
  const baseCommission = resolveBaseCommission(entry, profile);
  const bonusCommission = resolveBonusCommission(entry, profile);
  const adjustmentInfo = resolveAdjustments(entry.adjustments);

  const percentageComponent = roundCurrency(commissionableAmount * (ratePercent / 100));
  const computedAmount = roundCurrency(
    percentageComponent + baseCommission + bonusCommission + adjustmentInfo.total
  );

  const date = resolveDateString(entry.date);

  const docRef = entry.id
    ? baseCollection.doc(entry.id)
    : baseCollection.doc();

  const personName = formatPersonName(profile, entry.personName || entry.agentName || entry.employeeName);

  const referenceId = personType === 'employee' ? (entry.employeeId || entry.referenceId) : (entry.agentId || entry.referenceId);

  const response = {
    id: docRef.id,
    companyId,
    personType,
    type: entry.type,
    amount: computedAmount,
    ratePercent,
    commissionableAmount,
    baseCommission,
    bonusCommission,
    adjustments: adjustmentInfo.total,
    adjustmentBreakdown: adjustmentInfo.breakdown || null,
    percentageComponent,
    date,
    description: entry.description || '',
    referenceId,
    personName,
    department: profile?.department || entry.department || null,
    metadata: entry.metadata || null,
    saved: false,
  };

  const baseData = {
    companyId,
    personType,
    type: entry.type,
    amount: computedAmount,
    ratePercent,
    commissionableAmount,
    baseCommission,
    bonusCommission,
    adjustments: adjustmentInfo.total,
    percentageComponent,
    date,
    description: entry.description || '',
    processedBy: options.userId || null,
    processedByEmail: options.userEmail || null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (adjustmentInfo.breakdown) {
    baseData.adjustmentBreakdown = adjustmentInfo.breakdown;
  }

  if (entry.metadata) {
    baseData.metadata = entry.metadata;
  }

  const commissionableSource = entry.commissionableSource || profile?.commissionableSource;
  if (commissionableSource) {
    baseData.commissionableSource = commissionableSource;
  }

  const rateSource = entry.rateSource || profile?.rateSource;
  if (rateSource) {
    baseData.rateSource = rateSource;
  }

  if (response.department) {
    baseData.department = response.department;
  }

  if (personType === 'employee') {
    baseData.employeeId = referenceId;
    baseData.employeeName = personName;
  } else {
    baseData.agentId = referenceId;
    baseData.agentName = personName;
  }

  const setData = { ...baseData, createdAt: FieldValue.serverTimestamp() };

  const updateData = { ...baseData };
  if (!adjustmentInfo.breakdown) {
    updateData.adjustmentBreakdown = FieldValue.delete();
  }
  if (!entry.metadata) {
    updateData.metadata = FieldValue.delete();
  }
  if (!commissionableSource) {
    updateData.commissionableSource = FieldValue.delete();
  }
  if (!rateSource) {
    updateData.rateSource = FieldValue.delete();
  }
  if (!response.department) {
    updateData.department = FieldValue.delete();
  }
  if (personType === 'employee') {
    updateData.agentId = FieldValue.delete();
    updateData.agentName = FieldValue.delete();
  } else {
    updateData.employeeId = FieldValue.delete();
    updateData.employeeName = FieldValue.delete();
  }

  return {
    docRef,
    setData,
    updateData,
    response,
    isUpdate: Boolean(entry.id),
  };
};

const calculateCommissions = async (payload = {}, options = {}) => {
  const companyId = payload.companyId || options.companyId;
  if (!companyId) {
    throw createServiceError('invalid-argument', 'companyId is required.');
  }

  const entries = Array.isArray(payload.entries)
    ? payload.entries
    : Array.isArray(payload.commissions)
      ? payload.commissions
      : [];

  if (!entries.length) {
    throw createServiceError('invalid-argument', 'entries array is required.');
  }

  const save = payload.preview ? false : payload.save !== false;

  const userContext = options.context?.auth?.token || {};
  const userId = options.userId || options.context?.auth?.uid || userContext.uid || null;
  const userEmail = userContext.email || options.userEmail || null;

  const db = firestore();
  const batch = save ? db.batch() : null;
  const processed = [];
  let totalAmount = 0;

  for (const entry of entries) {
    const prepared = await prepareCommissionRecord({
      companyId,
      entry,
      options: { userId, userEmail },
    });

    if (save) {
      if (!prepared.isUpdate) {
        batch.set(prepared.docRef, prepared.setData);
      } else {
        batch.update(prepared.docRef, prepared.updateData);
      }
    }

    prepared.response.saved = save;
    prepared.response.personType = entry.personType || prepared.response.personType;
    processed.push(prepared.response);
    totalAmount = roundCurrency(totalAmount + prepared.response.amount);
  }

  if (save) {
    await batch.commit();
  }

  return {
    companyId,
    count: processed.length,
    totalAmount,
    saved: save,
    records: processed,
  };
};

const calculateCommission = async (payload = {}, options = {}) => {
  const companyId = payload.companyId || options.companyId;
  if (!companyId) {
    throw createServiceError('invalid-argument', 'companyId is required.');
  }

  const entry = { ...payload };
  delete entry.companyId;
  delete entry.entries;
  delete entry.commissions;

  const result = await calculateCommissions({
    companyId,
    entries: [entry],
    save: payload.save,
    preview: payload.preview,
  }, options);

  return result.records[0];
};

module.exports = {
  calculateCommissions,
  calculateCommission,
};


