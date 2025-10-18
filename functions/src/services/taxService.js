const admin = require('../utils/firebaseAdmin');

const DEFAULT_TAX_CONFIGURATION = Object.freeze({
  personalExemption: 20833.33,
  source: 'default',
  brackets: [
    Object.freeze({ min: 0, max: 8333.33, baseTax: 0, baseAmount: 0, rate: 0.20 }),
    Object.freeze({ min: 8333.34, max: 16666.67, baseTax: 1666.67, baseAmount: 8333.33, rate: 0.25 }),
    Object.freeze({ min: 16666.68, max: 25000, baseTax: 3750, baseAmount: 16666.67, rate: 0.30 }),
    Object.freeze({ min: 25000.01, max: 33333.33, baseTax: 6250, baseAmount: 25000, rate: 0.32 }),
    Object.freeze({ min: 33333.34, max: 41666.67, baseTax: 8916.67, baseAmount: 33333.33, rate: 0.35 }),
    Object.freeze({ min: 41666.68, max: Infinity, baseTax: 12083.33, baseAmount: 41666.67, rate: 0.40 }),
  ],
});

const createZeroContribution = () => ({ employee: 0, employer: 0 });

const toNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toPositiveNumber = (value, fallback = 0) => {
  const numeric = toNumber(value, fallback);
  return numeric > 0 ? numeric : 0;
};

const toBracketMin = (value) => {
  const numeric = toNumber(value, 0);
  return numeric > 0 ? numeric : 0;
};

const toBracketMax = (value) => {
  if (value === null || value === undefined || value === '') {
    return Infinity;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Infinity;
};

const roundCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const cloneDefaultTaxConfiguration = () => ({
  personalExemption: DEFAULT_TAX_CONFIGURATION.personalExemption,
  source: DEFAULT_TAX_CONFIGURATION.source,
  brackets: DEFAULT_TAX_CONFIGURATION.brackets.map((entry) => ({ ...entry })),
});

const normalizeRate = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric > 1 ? numeric / 100 : numeric;
};

const normalizeTaxConfig = (rawConfig, sourceLabel = 'custom') => {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return null;
  }

  const personalExemption = toNumber(rawConfig.personalExemption, DEFAULT_TAX_CONFIGURATION.personalExemption);

  let brackets = [];
  if (Array.isArray(rawConfig.brackets)) {
    brackets = rawConfig.brackets
      .map((entry) => {
        if (!entry) {
          return null;
        }

        const min = toBracketMin(entry.min ?? entry.lower ?? entry.lowerBound ?? entry.minAmount ?? 0);
        const max = toBracketMax(entry.max ?? entry.upper ?? entry.upperBound ?? entry.maxAmount);
        const rate = normalizeRate(entry.rate ?? entry.percentage ?? entry.ratePercent ?? entry.taxRate);

        if (rate === null || rate < 0) {
          return null;
        }

        const baseTax = toNumber(entry.baseTax ?? entry.fixedAmount ?? entry.base ?? entry.baseTaxAmount ?? 0, 0);
        const baseAmount = toNumber(entry.baseAmount ?? entry.min ?? entry.lowerBound ?? entry.threshold ?? min, min);

        return {
          min,
          max,
          rate,
          baseTax,
          baseAmount,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.min - b.min);
  }

  if (brackets.length === 0) {
    brackets = DEFAULT_TAX_CONFIGURATION.brackets.map((entry) => ({ ...entry }));
  }

  return {
    personalExemption,
    brackets,
    source: sourceLabel,
  };
};

const calculateSSSContribution = (monthlySalary) => {
  const salary = toPositiveNumber(monthlySalary, 0);
  if (salary <= 0) {
    return createZeroContribution();
  }

  const salaryCredit = Math.min(salary, 20000);
  return {
    employee: roundCurrency(salaryCredit * 0.085),
    employer: roundCurrency(salaryCredit * 0.115),
  };
};

const calculatePagibigContribution = (monthlySalary) => {
  const salary = toPositiveNumber(monthlySalary, 0);
  if (salary <= 0) {
    return createZeroContribution();
  }

  let employeeContribution;
  let employerContribution;

  if (salary <= 1500) {
    employeeContribution = Math.min(salary * 0.01, 100);
    employerContribution = Math.min(salary * 0.02, 100);
  } else {
    employeeContribution = Math.min(salary * 0.02, 100);
    employerContribution = Math.min(salary * 0.02, 100);
  }

  return {
    employee: roundCurrency(employeeContribution),
    employer: roundCurrency(employerContribution),
  };
};

const calculatePhilhealthContribution = (monthlySalary) => {
  const salary = toPositiveNumber(monthlySalary, 0);
  if (salary <= 0) {
    return createZeroContribution();
  }

  const individualShare = Math.max(100, Math.min(salary * 0.025, 800));

  return {
    employee: roundCurrency(individualShare),
    employer: roundCurrency(individualShare),
  };
};

const calculateWithholdingTax = ({
  monthlySalary,
  statutoryEmployeeDeductions = 0,
  additionalEmployeeDeductions = 0,
  taxConfig = DEFAULT_TAX_CONFIGURATION,
}) => {
  const salary = toPositiveNumber(monthlySalary, 0);
  if (salary <= 0) {
    return 0;
  }

  const personalExemption = toNumber(
    taxConfig.personalExemption,
    DEFAULT_TAX_CONFIGURATION.personalExemption
  );

  const statutory = toPositiveNumber(statutoryEmployeeDeductions, 0);
  const additional = toPositiveNumber(additionalEmployeeDeductions, 0);
  const taxableIncome = salary - personalExemption - statutory - additional;

  if (taxableIncome <= 0) {
    return 0;
  }

  const brackets = Array.isArray(taxConfig.brackets) && taxConfig.brackets.length > 0
    ? taxConfig.brackets
    : DEFAULT_TAX_CONFIGURATION.brackets;

  const activeBracket = brackets.find((entry) => taxableIncome <= entry.max) || brackets[brackets.length - 1];

  const baseAmount = toNumber(activeBracket.baseAmount ?? activeBracket.min ?? 0, 0);
  const baseTax = toNumber(activeBracket.baseTax ?? 0, 0);
  const rate = toNumber(activeBracket.rate ?? 0, 0);

  const tax = baseTax + (taxableIncome - baseAmount) * rate;

  return roundCurrency(Math.max(0, tax));
};

const getFirestore = () => {
  if (typeof admin.firestore !== 'function') {
    return null;
  }
  return admin.firestore();
};

const loadCompanyTaxConfig = async (companyId) => {
  if (!companyId) {
    return null;
  }

  const db = getFirestore();
  if (!db) {
    return null;
  }

  const companyRef = db.collection('companies').doc(companyId);
  const candidateRefs = [
    companyRef.collection('settings').doc('tax'),
    companyRef.collection('settings').doc('taxConfig'),
    companyRef.collection('config').doc('tax'),
    db.collection('taxConfigs').doc(companyId),
    db.collection('taxTables').doc(companyId),
  ];

  for (const ref of candidateRefs) {
    try {
      const snapshot = await ref.get();
      if (snapshot.exists) {
        const normalized = normalizeTaxConfig(snapshot.data(), `firestore:${ref.path}`);
        if (normalized) {
          return normalized;
        }
      }
    } catch (error) {
      console.error('[taxService] Failed to read tax configuration', {
        companyId,
        path: ref.path,
        error: error.message,
      });
    }
  }

  return null;
};

const getTaxBrackets = async (companyId) => {
  const companyConfig = await loadCompanyTaxConfig(companyId);
  if (companyConfig) {
    return companyConfig;
  }
  return cloneDefaultTaxConfiguration();
};

const computeStatutoryDeductions = async ({
  monthlySalary,
  includeTaxes = true,
  companyId,
  additionalEmployeeDeductions = 0,
  taxConfigOverride,
} = {}) => {
  const salary = toPositiveNumber(monthlySalary, 0);
  const include = Boolean(includeTaxes) && salary > 0;

  let taxConfig = cloneDefaultTaxConfiguration();
  if (include) {
    if (taxConfigOverride) {
      taxConfig = normalizeTaxConfig(taxConfigOverride, 'override') || cloneDefaultTaxConfiguration();
    } else {
      taxConfig = await getTaxBrackets(companyId);
    }
  }

  const sss = include ? calculateSSSContribution(salary) : createZeroContribution();
  const pagibig = include ? calculatePagibigContribution(salary) : createZeroContribution();
  const philhealth = include ? calculatePhilhealthContribution(salary) : createZeroContribution();

  const statutoryEmployee = include
    ? roundCurrency(sss.employee + pagibig.employee + philhealth.employee)
    : 0;
  const statutoryEmployer = include
    ? roundCurrency(sss.employer + pagibig.employer + philhealth.employer)
    : 0;

  const additionalEmployee = include ? roundCurrency(toPositiveNumber(additionalEmployeeDeductions, 0)) : 0;

  const withholdingTax = include
    ? calculateWithholdingTax({
        monthlySalary: salary,
        statutoryEmployeeDeductions: statutoryEmployee,
        additionalEmployeeDeductions: additionalEmployee,
        taxConfig,
      })
    : 0;

  const totalEmployeeDeductions = include
    ? roundCurrency(statutoryEmployee + additionalEmployee + withholdingTax)
    : 0;
  const totalEmployerContributions = include ? statutoryEmployer : 0;

  return {
    includeTaxes: include,
    monthlySalary: roundCurrency(salary),
    sssEmployee: roundCurrency(sss.employee),
    sssEmployer: roundCurrency(sss.employer),
    pagibigEmployee: roundCurrency(pagibig.employee),
    pagibigEmployer: roundCurrency(pagibig.employer),
    philhealthEmployee: roundCurrency(philhealth.employee),
    philhealthEmployer: roundCurrency(philhealth.employer),
    withholdingTax: roundCurrency(withholdingTax),
    statutoryEmployeeTotal: statutoryEmployee,
    statutoryEmployerTotal: statutoryEmployer,
    additionalEmployeeDeductions: additionalEmployee,
    totalEmployeeDeductions,
    totalEmployerContributions,
    taxConfiguration: {
      personalExemption: roundCurrency(taxConfig.personalExemption),
      source: taxConfig.source,
    },
  };
};

module.exports = {
  computeStatutoryDeductions,
  getTaxBrackets,
  calculateSSSContribution,
  calculatePagibigContribution,
  calculatePhilhealthContribution,
  calculateWithholdingTax,
};
