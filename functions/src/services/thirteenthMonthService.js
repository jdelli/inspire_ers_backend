const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const PAYROLL_COLLECTION = 'payrolls';
const EMPLOYEES_COLLECTION = 'employees';
const THIRTEENTH_MONTH_COLLECTION = 'thirteenthMonthPay';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const safeString = (value, fallback = '') => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
};

const toDate = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const resolveMonthKey = (data) => {
  if (data?.month && typeof data.month === 'string') {
    const normalized = data.month.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(normalized)) {
      return normalized;
    }
  }

  const fallback = toDate(data?.payDate) || toDate(data?.cutoffEndDate) || toDate(data?.cutoffStartDate) || toDate(data?.processedAt) || null;
  if (!fallback) {
    return null;
  }

  const year = fallback.getUTCFullYear();
  const month = fallback.getUTCMonth() + 1;
  return `${year}-${month.toString().padStart(2, '0')}`;
};

const buildMonthlySkeleton = (year) => {
  const months = {};
  for (let index = 0; index < 12; index += 1) {
    const monthNumber = index + 1;
    const monthKey = `${year}-${monthNumber.toString().padStart(2, '0')}`;
    months[monthKey] = {
      month: monthNumber,
      monthKey,
      monthName: MONTH_NAMES[index],
      netPay: 0,
      grossPay: 0,
      basicPay: 0,
      allowances: 0,
      otherEarnings: 0,
      totalDeductions: 0,
      payrolls: [],
    };
  }
  return months;
};

const ensureArray = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
};

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const loadEmployeeProfile = async (companyId, employeeId, providedProfile) => {
  if (providedProfile && typeof providedProfile === 'object') {
    return providedProfile;
  }

  const db = firestore();

  let snapshot = await db.collection(EMPLOYEES_COLLECTION).doc(employeeId).get();

  if (!snapshot.exists && companyId) {
    const nestedRef = db.collection('companies').doc(companyId).collection(EMPLOYEES_COLLECTION).doc(employeeId);
    snapshot = await nestedRef.get();
  }

  if (!snapshot.exists) {
    return {
      id: employeeId,
      employeeId,
    };
  }

  return {
    id: snapshot.id,
    employeeId: snapshot.id,
    ...snapshot.data(),
  };
};

const loadSavedThirteenthMonthDoc = async (companyId, employeeId, year) => {
  const db = firestore();
  const docId = `${employeeId}_${year}`;
  const docRef = db.collection(THIRTEENTH_MONTH_COLLECTION).doc(docId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data() || {};
  if (data.companyId && data.companyId !== companyId) {
    return null;
  }
  return {
    id: snapshot.id,
    ...data,
  };
};

const aggregatePayrollDocs = (monthlySkeleton, payrollDocs, year) => {
  payrollDocs.forEach((doc) => {
    const data = doc.data || doc;
    const monthKey = resolveMonthKey(data);
    if (!monthKey || !monthKey.startsWith(`${year}-`)) {
      return;
    }

    const entry = monthlySkeleton[monthKey];
    if (!entry) {
      return;
    }

    const netPay = roundCurrency(data.netPay ?? data.totalNetPay ?? 0);
    const grossPay = roundCurrency(data.grossPay ?? data.totalEarnings ?? data.basicPay ?? 0);
    const basicPay = roundCurrency(data.basicPay ?? data.monthlySalary ?? 0);
    const allowances = roundCurrency((data.allowance ?? 0) + (data.transpoAllowance ?? 0));
    const otherEarnings = roundCurrency((data.otPay ?? 0) + (data.memoBonus ?? 0));
    const totalDeductions = roundCurrency(data.totalDeductions ?? data.totalTaxDeductions ?? 0);

    entry.netPay = roundCurrency(entry.netPay + netPay);
    entry.grossPay = roundCurrency(entry.grossPay + grossPay);
    entry.basicPay = roundCurrency(entry.basicPay + basicPay);
    entry.allowances = roundCurrency(entry.allowances + allowances);
    entry.otherEarnings = roundCurrency(entry.otherEarnings + otherEarnings);
    entry.totalDeductions = roundCurrency(entry.totalDeductions + totalDeductions);

    entry.payrolls.push({
      payrollId: data.id || doc.id,
      payrollKey: data.payrollKey || null,
      payDate: safeString(data.payDate || ''),
      cutoffStartDate: safeString(data.cutoffStartDate || ''),
      cutoffEndDate: safeString(data.cutoffEndDate || ''),
      grossPay,
      netPay,
      basicPay,
      allowances,
      otherEarnings,
      totalDeductions,
    });
  });

  return Object.values(monthlySkeleton).sort((a, b) => a.month - b.month);
};

const mergeWithSavedData = (calculatedBreakdown, savedData) => {
  if (!savedData || !Array.isArray(savedData.monthlyBreakdown)) {
    return calculatedBreakdown;
  }

  const savedByMonth = new Map();
  savedData.monthlyBreakdown.forEach((entry = {}) => {
    if (!entry?.month) {
      return;
    }
    savedByMonth.set(entry.month, entry);
  });

  return calculatedBreakdown.map((entry) => {
    const saved = savedByMonth.get(entry.month) || savedByMonth.get(entry.monthKey);
    if (!saved) {
      return entry;
    }

    const netPay = roundCurrency(saved.netPay ?? entry.netPay ?? 0);
    return {
      ...entry,
      netPay,
      saved: true,
      deductions: saved.deductions || null,
      notes: saved.notes || null,
    };
  });
};

const computeEmployeeThirteenthMonth = async ({
  companyId,
  employeeId,
  year,
  employeeProfile,
  includeSaved = true,
}) => {
  const db = firestore();

  const snapshot = await db.collection(PAYROLL_COLLECTION)
    .where('employeeId', '==', employeeId)
    .get();

  const payrollDocs = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
    .filter((doc) => {
      const data = doc.data;
      if (data.companyId && data.companyId !== companyId) {
        return false;
      }
      const monthKey = resolveMonthKey(data);
      return monthKey && monthKey.startsWith(`${year}-`);
    });

  const monthlySkeleton = buildMonthlySkeleton(year);
  const monthlyBreakdown = aggregatePayrollDocs(monthlySkeleton, payrollDocs.map((doc) => ({ id: doc.id, ...doc.data })), year);

  let mergedBreakdown = monthlyBreakdown;
  let savedDoc = null;

  if (includeSaved) {
    savedDoc = await loadSavedThirteenthMonthDoc(companyId, employeeId, year);
    if (savedDoc) {
      mergedBreakdown = mergeWithSavedData(monthlyBreakdown, savedDoc);
    }
  }

  const totalNetPay = roundCurrency(mergedBreakdown.reduce((sum, entry) => sum + (entry.netPay || 0), 0));
  const monthsWorked = mergedBreakdown.filter((entry) => roundCurrency(entry.netPay) > 0).length;
  const thirteenthMonthPay = roundCurrency(totalNetPay / 12);
  const averageMonthlyNetPay = monthsWorked > 0 ? roundCurrency(totalNetPay / monthsWorked) : 0;

  const totalGrossPay = roundCurrency(mergedBreakdown.reduce((sum, entry) => sum + (entry.grossPay || 0), 0));

  const profile = employeeProfile || await loadEmployeeProfile(companyId, employeeId);

  return {
    employeeId,
    employeeName: safeString(profile?.employeeName || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim()),
    employeeIdNumber: safeString(profile?.idNumber || profile?.employeeNumber || ''),
    department: safeString(profile?.department || ''),
    position: safeString(profile?.position || ''),
    photoURL: profile?.photoURL || null,
    basicSalary: roundCurrency(profile?.basicSalary || profile?.basicPay || 0),
    year,
    totalNetPay,
    totalGrossPay,
    monthsWorked,
    thirteenthMonthPay,
    averageMonthlyNetPay,
    monthlyBreakdown: mergedBreakdown,
    payrollCount: payrollDocs.length,
    savedDocumentId: savedDoc?.id || null,
    source: {
      payrollDocuments: payrollDocs.map((doc) => doc.id),
      saved: Boolean(savedDoc),
    },
  };
};

const normalizeEmployeeInputs = (employees) => {
  return unique(ensureArray(employees).map((entry) => {
    if (!entry) {
      return null;
    }
    if (typeof entry === 'string') {
      return entry;
    }
    if (typeof entry === 'object') {
      return entry.employeeId || entry.id || entry.uid || entry.employee?.id || null;
    }
    return null;
  }));
};

const computeThirteenthMonthPay = async (payload = {}) => {
  const companyId = safeString(payload.companyId || payload.companyID || payload.company);
  if (!companyId) {
    const error = new Error('companyId is required.');
    error.code = 'invalid-argument';
    throw error;
  }

  const yearCandidate = payload.year || payload.taxYear || payload.periodYear;
  const selectedYear = Number(yearCandidate) || new Date().getFullYear();

  const employeeIds = normalizeEmployeeInputs(payload.employeeIds || payload.employees || payload.employeeId || payload.employee);

  if (employeeIds.length === 0) {
    const error = new Error('At least one employeeId is required.');
    error.code = 'invalid-argument';
    throw error;
  }

  const includeSaved = payload.includeSaved !== undefined ? Boolean(payload.includeSaved) : true;

  const results = [];

  for (const employeeId of employeeIds) {
    const employeeProfile = Array.isArray(payload.employees)
      ? payload.employees.find((entry) => (entry?.employeeId || entry?.id) === employeeId)
      : null;

    const result = await computeEmployeeThirteenthMonth({
      companyId,
      employeeId,
      year: selectedYear,
      employeeProfile,
      includeSaved,
    });
    results.push(result);
  }

  const totals = results.reduce((acc, entry) => {
    acc.totalNetPay = roundCurrency(acc.totalNetPay + entry.totalNetPay);
    acc.totalThirteenthMonthPay = roundCurrency(acc.totalThirteenthMonthPay + entry.thirteenthMonthPay);
    acc.totalGrossPay = roundCurrency(acc.totalGrossPay + entry.totalGrossPay);
    acc.totalEmployees += 1;
    acc.totalMonthsWorked += entry.monthsWorked;
    return acc;
  }, {
    totalNetPay: 0,
    totalThirteenthMonthPay: 0,
    totalGrossPay: 0,
    totalEmployees: 0,
    totalMonthsWorked: 0,
  });

  return {
    companyId,
    year: selectedYear,
    totals,
    employees: results,
  };
};

module.exports = {
  computeThirteenthMonthPay,
  computeEmployeeThirteenthMonth,
};
