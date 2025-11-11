const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');

const payrollFunctions = require('./src/api/payrollFunctions');
const commissionFunctions = require('./src/api/commissionFunctions');
const reportFunctions = require('./src/api/reportFunctions');
const reportFunctionsPhase4 = require('./src/api/reportFunctionsPhase4');
const activityFunctions = require('./src/api/activityFunctions');
const employeeFunctions = require('./src/api/employeeFunctions');
const employeeManagementFunctions = require('./src/api/employeeManagementFunctions');
const attendanceFunctions = require('./src/api/attendanceFunctions');
const fileFunctions = require('./src/api/fileFunctions');
const firestoreFunctions = require('./src/api/firestoreFunctions');
const auditFunctions = require('./src/api/auditFunctions');
const payslipFunctions = require('./src/api/payslipFunctions');
const traineePayrollFunctions = require('./src/api/traineePayrollFunctions');

const pettyCashFunctions = require('./src/api/pettyCashFunctions');
const taxService = require('./src/services/taxService');
const payrollService = require('./src/services/payrollService');
const commissionService = require('./src/services/commissionService');
const thirteenthMonthService = require('./src/services/thirteenthMonthService');
const { requirePayrollAccess } = require('./src/middleware/payrollAuth');
const { requireAuditAccess } = require('./src/middleware/auditAuth');
const { attachRequestContext, requireAuthenticatedUser } = require('./src/middleware/requestContext');
const { recordActivity } = require('./src/services/activityLogService');

const buildCallableActivityContext = (context = {}) => {
  const rawRequest = context.rawRequest || {};
  const headers = rawRequest.headers || {};
  const forwardedRaw = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
  const forwardedFor = typeof forwardedRaw === 'string'
    ? forwardedRaw.split(',').map((value) => value.trim()).filter(Boolean)
    : [];

  const userContext = context.auth
    ? {
        uid: context.auth.uid || null,
        email: (context.auth.token && context.auth.token.email) || null,
        specialrole:
          (context.auth.token && (context.auth.token.specialrole || context.auth.token.role)) || null,
        token: context.auth.token || null,
      }
    : null;

  return {
    user: userContext,
    request: {
      requestId: headers['x-request-id'] || headers['X-Request-Id'] || context.eventId || randomUUID(),
      ip: rawRequest.ip || headers['x-real-ip'] || null,
      forwardedFor,
      userAgent: headers['user-agent'] || null,
    },
  };
};

const logActivitySafe = async (payload = {}) => {
  try {
    await recordActivity(payload);
  } catch (error) {
    console.error('Failed to record activity log:', error);
  }
};

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(attachRequestContext);

// Apply payroll authorization middleware to payroll routes
app.use('/payroll', requirePayrollAccess, payrollFunctions);
app.use('/trainee-payroll', requirePayrollAccess, traineePayrollFunctions);

// Other routes remain unprotected
app.use('/commissions', commissionFunctions);
app.use('/reports', requireAuthenticatedUser, reportFunctions);
app.use('/reports/v4', requireAuthenticatedUser, reportFunctionsPhase4);
app.use('/activity', requireAuthenticatedUser, activityFunctions);
app.use('/employee-mgmt', requireAuthenticatedUser, employeeManagementFunctions);
app.use('/attendance', requireAuthenticatedUser, attendanceFunctions);
app.use('/employees', employeeFunctions);
app.use('/files', requireAuthenticatedUser, fileFunctions);
app.use('/firestore', requireAuthenticatedUser, firestoreFunctions);
app.use('/audit', requireAuditAccess, auditFunctions);

app.use('/pettycash', requireAuthenticatedUser, pettyCashFunctions);
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

  // Check if user has superadmin role for payroll access
  const admin = require('firebase-admin');
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  
  if (!userDoc.exists || userDoc.data().specialrole !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'You do not have permission to access payroll data. Super Admin privileges required.');
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
    const activityContext = buildCallableActivityContext(context);
    const payrollData = (result && result.payroll) || {};
    const companyIdForLog =
      payrollData.companyId || payload.companyId || (context.auth.token && context.auth.token.companyId) || null;

    await logActivitySafe({
      module: 'hr',
      action: result && result.created ? 'PAYROLL_GENERATED' : 'PAYROLL_RECORD_UPDATED',
      companyId: companyIdForLog,
      entityType: 'employee',
      entityId: payrollData.employeeId || payload.employeeId || null,
      summary: `${result && result.created ? 'Generated' : 'Updated'} payroll via callable for employee ${
        payrollData.employeeId || payload.employeeId || 'unknown'
      }`,
      metadata: {
        payrollId: result && result.payrollId ? result.payrollId : null,
        payrollKey: (result && (result.payrollKey || payrollData.payrollKey)) || null,
        payDate: payrollData.payDate || payload.payDate || null,
        created: Boolean(result && result.created),
      },
      context: activityContext,
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

  // Check if user has superadmin role for payroll access
  const admin = require('firebase-admin');
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  
  if (!userDoc.exists || userDoc.data().specialrole !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'You do not have permission to access payroll data. Super Admin privileges required.');
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
    const activityContext = buildCallableActivityContext(context);
    const companyIdForLog = payload.companyId || (context.auth.token && context.auth.token.companyId) || null;

    await logActivitySafe({
      module: 'hr',
      action: 'PAYROLL_BULK_GENERATED',
      companyId: companyIdForLog,
      entityType: 'batch',
      entityId: null,
      summary: `Bulk payroll callable processed ${result.created ?? 0} new and ${result.updated ?? 0} updated records`,
      metadata: {
        processed: result.processed ?? 0,
        created: result.created ?? 0,
        updated: result.updated ?? 0,
        failed: result.failed ?? 0,
      },
      context: activityContext,
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

