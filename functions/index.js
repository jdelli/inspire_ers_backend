const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

const payrollFunctions = require('./src/api/payrollFunctions');
const commissionFunctions = require('./src/api/commissionFunctions');
const reportFunctions = require('./src/api/reportFunctions');
const reportFunctionsPhase4 = require('./src/api/reportFunctionsPhase4');
const employeeFunctions = require('./src/api/employeeFunctions');
const employeeManagementFunctions = require('./src/api/employeeManagementFunctions');
const attendanceFunctions = require('./src/api/attendanceFunctions');
const fileFunctions = require('./src/api/fileFunctions');
const payslipFunctions = require('./src/api/payslipFunctions');
const traineePayrollFunctions = require('./src/api/traineePayrollFunctions');
const adminFunctions = require('./src/api/adminFunctions');
const taxService = require('./src/services/taxService');
const payrollService = require('./src/services/payrollService');
const commissionService = require('./src/services/commissionService');
const thirteenthMonthService = require('./src/services/thirteenthMonthService');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.use('/payroll', payrollFunctions);
app.use('/commissions', commissionFunctions);
app.use('/reports', reportFunctions);
app.use('/reports/v4', reportFunctionsPhase4);
app.use('/employee-mgmt', employeeManagementFunctions);
app.use('/attendance', attendanceFunctions);
app.use('/employees', employeeFunctions);
app.use('/files', fileFunctions);
app.use('/payslips', payslipFunctions);
app.use('/trainee-payroll', traineePayrollFunctions);
app.use('/admin', adminFunctions);

exports.api = functions.https.onRequest(app);

const VALID_HTTPS_ERROR_CODES = new Set([
  'ok',
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
  'unauthenticated',
]);

const mapServiceErrorCode = (code) => {
  if (code && VALID_HTTPS_ERROR_CODES.has(code)) {
    return code;
  }
  return 'internal';
};

exports.calculateDeductions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  const payload = data || {};
  const token = context.auth.token || {};
  const companyId = payload.companyId || token.companyId;

  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
  }

  const salaryCandidate = payload.monthlySalary ?? payload.basicSalary ?? payload.basicPay;
  const monthlySalary = Number(salaryCandidate);

  if (!Number.isFinite(monthlySalary)) {
    throw new functions.https.HttpsError('invalid-argument', 'monthlySalary must be provided as a number.');
  }

  const includeTaxes = payload.includeTaxes === undefined ? true : Boolean(payload.includeTaxes);

  const additionalEmployeeDeductionsValue = Number(payload.additionalEmployeeDeductions ?? 0);
  const additionalEmployeeDeductions = Number.isFinite(additionalEmployeeDeductionsValue)
    ? additionalEmployeeDeductionsValue
    : 0;

  let taxConfigOverride;
  if (Array.isArray(payload.taxBrackets) || payload.personalExemption !== undefined) {
    taxConfigOverride = {
      brackets: payload.taxBrackets,
      personalExemption: payload.personalExemption,
    };
  }

  const deductions = await taxService.computeStatutoryDeductions({
    companyId,
    monthlySalary,
    includeTaxes,
    additionalEmployeeDeductions,
    taxConfigOverride,
  });

  return deductions;
});

exports.calculatePayroll = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  const payload = data || {};
  if (!payload.companyId && context.auth.token?.companyId) {
    payload.companyId = context.auth.token.companyId;
  }

  try {
    const result = await payrollService.calculatePayroll(payload, {
      context,
      userId: context.auth.uid,
      token: context.auth.token,
    });
    return result;
  } catch (error) {
    const code = mapServiceErrorCode(error.code);
    throw new functions.https.HttpsError(code, error.message || 'Failed to calculate payroll.', error.details);
  }
});

exports.bulkCalculatePayroll = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  const payload = data || {};
  if (!payload.companyId && context.auth.token?.companyId) {
    payload.companyId = context.auth.token.companyId;
  }

  if (!Array.isArray(payload.employees) || payload.employees.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'employees array is required.');
  }

  try {
    const result = await payrollService.bulkCalculatePayroll(payload, {
      context,
      userId: context.auth.uid,
      token: context.auth.token,
      companyId: payload.companyId,
    });
    return result;
  } catch (error) {
    const code = mapServiceErrorCode(error.code);
    throw new functions.https.HttpsError(code, error.message || 'Failed to process bulk payroll.', error.details);
  }
});

exports.calculateCommissions = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  const payload = data || {};
  if (!payload.companyId && context.auth.token?.companyId) {
    payload.companyId = context.auth.token.companyId;
  }

  try {
    const hasMultiple = Array.isArray(payload.entries) || Array.isArray(payload.commissions);
    if (hasMultiple) {
      return await commissionService.calculateCommissions(payload, { context });
    }
    return await commissionService.calculateCommission(payload, { context });
  } catch (error) {
    const code = mapServiceErrorCode(error.code);
    throw new functions.https.HttpsError(code, error.message || 'Failed to calculate commissions.', error.details);
  }
});
exports.calculate13thMonthPay = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  const payload = data || {};
  if (!payload.companyId && context.auth.token?.companyId) {
    payload.companyId = context.auth.token.companyId;
  }

  try {
    const result = await thirteenthMonthService.computeThirteenthMonthPay(payload);
    return result;
  } catch (error) {
    const code = mapServiceErrorCode(error.code);
    throw new functions.https.HttpsError(code, error.message || 'Failed to calculate 13th month pay.', error.details);
  }
});
