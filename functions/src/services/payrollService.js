const admin = require('../utils/firebaseAdmin');
const taxService = require('./taxService');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;

const DEFAULT_WORKING_DAYS = 22;
const HOURS_PER_DAY = 8;
const MINUTES_PER_DAY = HOURS_PER_DAY * 60;
const OVERTIME_RATE_PER_HOUR = 128.85;
const BULK_CHUNK_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const PAYROLL_COLLECTION = 'payrolls';

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

const parseBoolean = (value, fallback = false) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  return Boolean(value);
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const safeString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
};

const deriveMonth = (cutoffStartDate, payDate, fallback) => {
  const candidate = cutoffStartDate || payDate || fallback;
  if (!candidate) {
    return null;
  }
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 7);
};

const cleanObject = (input) => {
  return Object.keys(input).reduce((acc, key) => {
    const value = input[key];
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const chunkArray = (items, size) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const chunkSize = Math.max(1, size);
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const ensureCompanyData = async (companyId, provided) => {
  if (provided && typeof provided === 'object') {
    return provided;
  }

  const db = firestore();
  const companyRef = db.collection('companies').doc(companyId);
  const snapshot = await companyRef.get();

  if (!snapshot.exists) {
    throw createServiceError('not-found', `Company ${companyId} not found.`);
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const ensureEmployeeData = async (companyId, employeeId, provided) => {
  if (provided && typeof provided === 'object') {
    return provided;
  }

  const db = firestore();

  let snapshot = await db.collection('employees').doc(employeeId).get();

  if (!snapshot.exists && companyId) {
    const companyEmployeeRef = db.collection('companies').doc(companyId).collection('employees').doc(employeeId);
    snapshot = await companyEmployeeRef.get();
  }

  if (!snapshot.exists) {
    throw createServiceError('not-found', `Employee ${employeeId} not found.`);
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
};

const buildPayrollKey = (employeeId, cutoffStartDate, cutoffEndDate, payDate) => {
  const parts = [employeeId, cutoffStartDate, cutoffEndDate, payDate].map((part) => safeString(part));
  if (parts.some((part) => !part)) {
    throw createServiceError('invalid-argument', 'cutoffStartDate, cutoffEndDate, and payDate are required to build payroll key.');
  }
  return parts.join('_');
};

const findExistingPayrollDocId = async (companyId, payrollKey) => {
  const db = firestore();
  const snapshot = await db.collection(PAYROLL_COLLECTION)
    .where('payrollKey', '==', payrollKey)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data() || {};

  if (companyId && data.companyId && data.companyId !== companyId) {
    return null;
  }

  return doc.id;
};

const formatEmployeeName = (employee) => {
  if (!employee || typeof employee !== 'object') {
    return '';
  }
  if (employee.employeeName) {
    return safeString(employee.employeeName);
  }
  const parts = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).map(safeString).filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  if (employee.name) {
    return safeString(employee.name);
  }
  if (employee.fullName) {
    return safeString(employee.fullName);
  }
  return safeString(employee.id || employee.employeeId || '');
};

const preparePayrollRecord = async (payload = {}, options = {}) => {
  const tokenCompanyId = options.companyId || options?.context?.auth?.token?.companyId || options?.token?.companyId;
  const companyId = payload.companyId || tokenCompanyId;

  if (!companyId) {
    throw createServiceError('invalid-argument', 'companyId is required.');
  }

  const employeeId = payload.employeeId
    || payload.employee?.id
    || payload.employee?.employeeId
    || payload.employee?.uid;

  if (!employeeId) {
    throw createServiceError('invalid-argument', 'employeeId is required.');
  }

  const companyData = await ensureCompanyData(companyId, payload.company);
  const employeeData = await ensureEmployeeData(companyId, employeeId, payload.employee);

  const payrollPeriodInput = {
    ...(payload.payrollPeriod || {}),
  };

  const cutoffStartDate = payload.cutoffStartDate
    || payrollPeriodInput.cutoffStartDate
    || payrollPeriodInput.startDate
    || payrollPeriodInput.periodStart;

  const cutoffEndDate = payload.cutoffEndDate
    || payrollPeriodInput.cutoffEndDate
    || payrollPeriodInput.endDate
    || payrollPeriodInput.periodEnd;

  const payDate = payload.payDate
    || payrollPeriodInput.payDate
    || payrollPeriodInput.date;

  if (!cutoffStartDate || !cutoffEndDate || !payDate) {
    throw createServiceError('invalid-argument', 'cutoffStartDate, cutoffEndDate, and payDate are required.');
  }

  const workingDays = Math.max(1, toNumber(
    payload.workingDays
      ?? payrollPeriodInput.workingDays
      ?? employeeData.workingDays
      ?? DEFAULT_WORKING_DAYS,
    DEFAULT_WORKING_DAYS,
  ));

  const month = payload.month
    || payrollPeriodInput.month
    || deriveMonth(cutoffStartDate, payDate, null)
    || deriveMonth(null, new Date().toISOString(), null);

  const baseSalaryCandidate = payload.basicPay
    ?? payload.basicSalary
    ?? payrollPeriodInput.basicPay
    ?? employeeData.basicPay
    ?? employeeData.basicSalary
    ?? 0;

  const basicPay = roundCurrency(toNumber(baseSalaryCandidate, 0));

  const allowance = roundCurrency(toNumber(
    payload.allowance
      ?? payload.allowances
      ?? payload.adjustments?.allowance
      ?? employeeData.allowance
      ?? 0,
    0,
  ));

  const transpoAllowance = roundCurrency(toNumber(
    payload.transpoAllowance
      ?? payload.transportAllowance
      ?? payload.transportationAllowance
      ?? payload.adjustments?.transpoAllowance
      ?? payload.adjustments?.transportationAllowance
      ?? employeeData.transpoAllowance
      ?? employeeData.transportationAllowance
      ?? 0,
    0,
  ));

  const refreshment = roundCurrency(toNumber(
    payload.refreshment
      ?? payload.adjustments?.refreshment
      ?? 0,
    0,
  ));

  const minutesLate = toNumber(
    payload.mins
      ?? payload.minutesLate
      ?? payload.adjustments?.mins
      ?? payload.adjustments?.minutesLate
      ?? 0,
    0,
  );

  const absentDays = toNumber(
    payload.absent
      ?? payload.absentDays
      ?? payload.adjustments?.absent
      ?? payload.adjustments?.absentDays
      ?? 0,
    0,
  );

  const halfDayUnits = toNumber(
    payload.halfDay
      ?? payload.halfDayMinutes
      ?? payload.halfDays
      ?? payload.adjustments?.halfDay
      ?? payload.adjustments?.halfDayMinutes
      ?? payload.adjustments?.halfDays
      ?? 0,
    0,
  );

  const otMinutes = toNumber(
    payload.otMinutes
      ?? payload.overtimeMinutes
      ?? payload.adjustments?.otMinutes
      ?? payload.adjustments?.overtimeMinutes
      ?? 0,
    0,
  );

  const undertimeMinutes = toNumber(
    payload.undertimeMinutes
      ?? payload.undertime
      ?? payload.adjustments?.undertimeMinutes
      ?? payload.adjustments?.undertime
      ?? 0,
    0,
  );

  const cashAdvance = roundCurrency(toNumber(
    payload.cashAdvance
      ?? payload.adjustments?.cashAdvance
      ?? employeeData.cashAdvance
      ?? 0,
    0,
  ));

  const memo = roundCurrency(toNumber(
    payload.memo
      ?? payload.adjustments?.memo
      ?? 0,
    0,
  ));

  const includeTaxes = parseBoolean(
    payload.includeTaxes
      ?? payload.adjustments?.includeTaxes
      ?? payload.tax?.includeTaxes
      ?? employeeData.includeTaxes,
    false,
  );

  const additionalEmployeeDeductions = roundCurrency(toNumber(
    payload.additionalEmployeeDeductions
      ?? payload.tax?.additionalEmployeeDeductions
      ?? payload.adjustments?.additionalEmployeeDeductions
      ?? 0,
    0,
  ));

  const taxBracketsOverride = payload.taxBrackets
    ?? payload.tax?.taxBrackets
    ?? payload.adjustments?.taxBrackets;

  const personalExemptionOverride = payload.personalExemption
    ?? payload.tax?.personalExemption
    ?? payload.adjustments?.personalExemption;

  const dailyRateRaw = workingDays > 0 ? basicPay / workingDays : 0;
  const perHourRateRaw = dailyRateRaw / HOURS_PER_DAY;
  const perMinuteRateRaw = dailyRateRaw / MINUTES_PER_DAY;

  const dailyRate = roundCurrency(dailyRateRaw);
  const perHourRate = roundCurrency(perHourRateRaw);
  const perMinuteRate = roundCurrency(perMinuteRateRaw);

  const totalLate = roundCurrency(minutesLate * perMinuteRate);
  const totalUndertime = roundCurrency(undertimeMinutes * perMinuteRate);
  const absentValue = roundCurrency(absentDays * dailyRate);
  const halfDayValue = roundCurrency(halfDayUnits * perMinuteRate);
  const totalAbsent = roundCurrency(absentValue + halfDayValue);

  const overtimeRatePerMinute = OVERTIME_RATE_PER_HOUR / 60;
  const otPay = roundCurrency(otMinutes * overtimeRatePerMinute);

  let taxOverride;
  if (taxBracketsOverride || personalExemptionOverride !== undefined) {
    taxOverride = cleanObject({
      brackets: taxBracketsOverride,
      personalExemption: personalExemptionOverride,
    });
  }

  let taxBreakdown;
  try {
    taxBreakdown = await taxService.computeStatutoryDeductions({
      companyId,
      monthlySalary: basicPay,
      includeTaxes,
      additionalEmployeeDeductions,
      taxConfigOverride: taxOverride,
    });
  } catch (error) {
    throw createServiceError('internal', 'Failed to compute statutory deductions.', error.message);
  }

  const sssEmployee = roundCurrency(taxBreakdown.sssEmployee || 0);
  const sssEmployer = roundCurrency(taxBreakdown.sssEmployer || 0);
  const pagibigEmployee = roundCurrency(taxBreakdown.pagibigEmployee || 0);
  const pagibigEmployer = roundCurrency(taxBreakdown.pagibigEmployer || 0);
  const philhealthEmployee = roundCurrency(taxBreakdown.philhealthEmployee || 0);
  const philhealthEmployer = roundCurrency(taxBreakdown.philhealthEmployer || 0);
  const birTax = roundCurrency(taxBreakdown.withholdingTax || 0);
  const taxEnabled = Boolean(taxBreakdown.includeTaxes);

  const totalTaxDeductions = taxEnabled
    ? roundCurrency(sssEmployee + pagibigEmployee + philhealthEmployee + birTax)
    : 0;

  const totalDeductions = roundCurrency(
    refreshment
      + totalLate
      + totalUndertime
      + totalAbsent
      + totalTaxDeductions
      + cashAdvance,
  );

  const grossPay = roundCurrency(basicPay + allowance + transpoAllowance + otPay);
  const netPay = roundCurrency(grossPay - totalDeductions);

  const totalEmployerContributions = taxEnabled
    ? roundCurrency(sssEmployer + pagibigEmployer + philhealthEmployer)
    : 0;

  const payrollKey = buildPayrollKey(employeeId, cutoffStartDate, cutoffEndDate, payDate);
  const existingDocId = await findExistingPayrollDocId(companyId, payrollKey);

  const timestampIso = new Date().toISOString();

  const payrollRecord = cleanObject({
    companyId,
    companyName: safeString(companyData.name || companyData.companyName || ''),
    employeeId,
    employeeName: formatEmployeeName(employeeData),
    month,
    cutoffStartDate: safeString(cutoffStartDate),
    cutoffEndDate: safeString(cutoffEndDate),
    payDate: safeString(payDate),
    payrollKey,
    workingDays,
    basicPay,
    allowance,
    transpoAllowance,
    refreshment,
    mins: minutesLate,
    absent: absentDays,
    halfDay: halfDayUnits,
    otMinutes,
    undertimeMinutes,
    dailyRate,
    perHour: perHourRate,
    perMinute: perMinuteRate,
    totalLate,
    totalUndertime,
    absentValue,
    halfDayValue,
    totalAbsent,
    otPay,
    includeTaxes: taxEnabled,
    sssEmployee,
    sssEmployer,
    pagibigEmployee,
    pagibigEmployer,
    philhealthEmployee,
    philhealthEmployer,
    birTax,
    totalTaxDeductions,
    totalEmployerContributions,
    totalDeductions,
    totalEarnings: grossPay,
    grossPay,
    netPay,
    cashAdvance,
    memo,
    department: safeString(employeeData.department || 'N/A'),
    position: safeString(employeeData.position || 'N/A'),
    bankAccount: safeString(employeeData.bankAccount || employeeData.bankAccountNumber || employeeData.bank || 'N/A'),
    idNumber: safeString(employeeData.idNumber || employeeData.employeeId || employeeId),
    monthlySalary: basicPay,
    statutoryEmployeeTotal: roundCurrency(taxBreakdown.statutoryEmployeeTotal || totalTaxDeductions),
    statutoryEmployerTotal: roundCurrency(taxBreakdown.statutoryEmployerTotal || totalEmployerContributions),
    additionalEmployeeDeductions,
    withholdingTax: birTax,
    overtimeRatePerHour: OVERTIME_RATE_PER_HOUR,
    overtimeRatePerMinute,
    processedAt: timestampIso,
    taxConfiguration: taxBreakdown.taxConfiguration,
  });

  if (options.userId) {
    payrollRecord.processedBy = options.userId;
  }

  if (options?.context?.auth?.token?.email) {
    payrollRecord.processedByEmail = options.context.auth.token.email;
  }

  const responseRecord = {
    ...payrollRecord,
    updatedAt: timestampIso,
  };

  return {
    firestoreData: payrollRecord,
    responseData: responseRecord,
    existingDocId,
  };
};

const calculatePayroll = async (payload = {}, options = {}) => {
  const { firestoreData, responseData, existingDocId } = await preparePayrollRecord(payload, options);

  const db = firestore();
  const collectionRef = db.collection(PAYROLL_COLLECTION);
  const docRef = existingDocId ? collectionRef.doc(existingDocId) : collectionRef.doc();
  const isNew = !existingDocId;

  const writeData = {
    ...firestoreData,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (isNew) {
    await docRef.set({
      ...writeData,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    await docRef.update(writeData);
  }

  return {
    payrollId: docRef.id,
    payrollKey: firestoreData.payrollKey,
    created: isNew,
    payroll: {
      ...responseData,
      id: docRef.id,
    },
  };
};

const bulkCalculatePayroll = async (payload = {}, options = {}) => {
  const entries = Array.isArray(payload.employees) ? payload.employees : [];

  if (entries.length === 0) {
    throw createServiceError('invalid-argument', 'employees array is required and cannot be empty.');
  }

  const chunkSizeCandidate = toNumber(payload.chunkSize, BULK_CHUNK_SIZE);
  const chunkSize = Math.min(Math.max(1, chunkSizeCandidate), MAX_BATCH_SIZE);

  const results = [];
  const errors = [];
  let processed = 0;
  let created = 0;
  let updated = 0;

  const db = firestore();
  const collectionRef = db.collection(PAYROLL_COLLECTION);

  const sharedCompanyId = payload.companyId || options.companyId || options?.context?.auth?.token?.companyId;
  const sharedPeriod = payload.payrollPeriod || {};

  const queued = chunkArray(entries, chunkSize);

  for (const chunk of queued) {
    const batch = db.batch();
    let operationsInBatch = 0;
    const chunkResults = [];

    for (const entry of chunk) {
      const entryPayload = {
        ...entry,
        payrollPeriod: {
          ...sharedPeriod,
          ...(entry.payrollPeriod || {}),
        },
        companyId: entry.companyId || sharedCompanyId,
      };

      try {
        const { firestoreData, responseData, existingDocId } = await preparePayrollRecord(entryPayload, options);
        const docRef = existingDocId ? collectionRef.doc(existingDocId) : collectionRef.doc();
        const isNew = !existingDocId;

        const writeData = {
          ...firestoreData,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (isNew) {
          batch.set(docRef, {
            ...writeData,
            createdAt: FieldValue.serverTimestamp(),
          });
          created += 1;
        } else {
          batch.update(docRef, writeData);
          updated += 1;
        }

        operationsInBatch += 1;

        chunkResults.push({
          payrollId: docRef.id,
          payrollKey: firestoreData.payrollKey,
          employeeId: firestoreData.employeeId,
          companyId: firestoreData.companyId,
          created: isNew,
          payroll: {
            ...responseData,
            id: docRef.id,
          },
        });
      } catch (error) {
        const employeeId = entry.employeeId || entry.employee?.id || entry.employee?.employeeId;
        const errorPayload = {
          employeeId,
          code: error.code || 'internal',
          message: error.message || 'Failed to process payroll entry.',
          failed: true,
        };
        errors.push(errorPayload);
        chunkResults.push(errorPayload);
      }
    }

    if (operationsInBatch > 0) {
      await batch.commit();
      processed += operationsInBatch;
    }

    results.push(...chunkResults);
  }

  return {
    processed,
    created,
    updated,
    failed: errors.length,
    results,
    errors,
  };
};

module.exports = {
  calculatePayroll,
  bulkCalculatePayroll,
  preparePayrollRecord,
};

// Add deletion helpers for payroll records
const deleteQueryInBatches = async (query) => {
  const db = firestore();
  const snapshot = await query.get();
  if (snapshot.empty) return { deleted: 0 };
  const batch = db.batch();
  let count = 0;
  snapshot.forEach((doc) => {
    batch.delete(doc.ref);
    count += 1;
  });
  await batch.commit();
  return { deleted: count };
};

const deletePayrollByPeriod = async ({ companyId, payDate, cutoffStartDate, cutoffEndDate }) => {
  if (!safeString(companyId) || !safeString(payDate)) {
    throw createServiceError('invalid-argument', 'companyId and payDate are required');
  }
  const db = firestore();
  let q = db.collection(PAYROLL_COLLECTION)
    .where('companyId', '==', companyId)
    .where('payDate', '==', payDate);
  if (safeString(cutoffStartDate)) {
    q = q.where('cutoffStartDate', '==', safeString(cutoffStartDate));
  }
  if (safeString(cutoffEndDate)) {
    q = q.where('cutoffEndDate', '==', safeString(cutoffEndDate));
  }
  const result = await deleteQueryInBatches(q);
  return { success: true, ...result };
};

const deletePayrollByEmployee = async ({ companyId, payDate, employeeId, cutoffStartDate, cutoffEndDate }) => {
  if (!safeString(companyId) || !safeString(payDate) || !safeString(employeeId)) {
    throw createServiceError('invalid-argument', 'companyId, payDate and employeeId are required');
  }
  const db = firestore();
  let q = db.collection(PAYROLL_COLLECTION)
    .where('companyId', '==', companyId)
    .where('payDate', '==', payDate)
    .where('employeeId', '==', employeeId);
  if (safeString(cutoffStartDate)) {
    q = q.where('cutoffStartDate', '==', safeString(cutoffStartDate));
  }
  if (safeString(cutoffEndDate)) {
    q = q.where('cutoffEndDate', '==', safeString(cutoffEndDate));
  }
  const result = await deleteQueryInBatches(q);
  return { success: true, ...result };
};

module.exports.deletePayrollByPeriod = deletePayrollByPeriod;
module.exports.deletePayrollByEmployee = deletePayrollByEmployee;




