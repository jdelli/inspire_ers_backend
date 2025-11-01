const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const { recordActivity } = require('../services/activityLogService');

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();
const db = admin.firestore();
const router = express.Router();

const NUMERIC_FIELDS = [
  'workingDays',
  'basicPay',
  'allowance',
  'transpoAllowance',
  'otPay',
  'grossPay',
  'mins',
  'absent',
  'halfDay',
  'otMinutes',
  'undertimeMinutes',
  'refreshment',
  'cashAdvance',
  'memo',
  'totalLate',
  'totalUndertime',
  'absentValue',
  'halfDayValue',
  'totalAbsent',
  'totalDeductions',
  'dailyRate',
  'perHour',
  'perMinute',
  'sssEmployee',
  'sssEmployer',
  'pagibigEmployee',
  'pagibigEmployer',
  'philhealthEmployee',
  'philhealthEmployer',
  'birTax',
  'totalTaxDeductions',
  'totalEmployerContributions',
  'netPay',
];

const REQUIRED_PAYROLL_FIELDS = [
  'companyId',
  'employeeId',
  'payrollKey',
  'payDate',
  'cutoffStartDate',
  'cutoffEndDate',
];

const sanitizePayrollRecord = (payload = {}) => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }

    if (NUMERIC_FIELDS.includes(key)) {
      const numericValue = Number(value);
      sanitized[key] = Number.isFinite(numericValue) ? numericValue : 0;
      continue;
    }

    if (key === 'includeTaxes') {
      sanitized[key] = Boolean(value);
      continue;
    }

    if (
      key === 'payDate' ||
      key === 'cutoffStartDate' ||
      key === 'cutoffEndDate' ||
      key === 'month'
    ) {
      sanitized[key] = value ? String(value).trim() : '';
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
};

const logActivitySafe = async (payload = {}) => {
  try {
    await recordActivity(payload);
  } catch (error) {
    console.error('Failed to record payroll activity log:', error);
  }
};

// Calculate payroll for a single employee
router.post('/calculate', async (req, res) => {
  try {
    const {
      companyId,
      employeeId,
      payrollPeriod,
      basicPay,
      allowance,
      transpoAllowance,
      refreshment,
      mins,
      absent,
      halfDay,
      otMinutes,
      undertimeMinutes,
      includeTaxes,
      cashAdvance,
      memo
    } = req.body;

    console.log('🔍 Calculating payroll for employee:', employeeId);

    // Validate required parameters
    if (!companyId || !employeeId || !payrollPeriod) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, employeeId, payrollPeriod'
      });
    }

    const { cutoffStartDate, cutoffEndDate, payDate, workingDays } = payrollPeriod;

    // Get employee data
    const employeeDoc = await db.collection('employees').doc(employeeId).get();
    if (!employeeDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    const employeeData = employeeDoc.data();
    const employeeName = `${employeeData.firstName} ${employeeData.lastName}`;

    // Calculate payroll
    const dailyRate = basicPay / workingDays;
    const perHour = dailyRate / 8;
    const perMinute = Math.round((dailyRate / 480) * 100) / 100;

    const totalLate = Math.round((mins * perMinute) * 100) / 100;
    const totalUndertime = Math.round((undertimeMinutes * perMinute) * 100) / 100;
    const absentValue = Math.round((absent * dailyRate) * 100) / 100;
    const halfDayValue = Math.round((halfDay * perMinute) * 100) / 100;
    const totalAbsent = Math.round((absentValue + halfDayValue) * 100) / 100;
    const otPay = otMinutes * (128.85 / 60);

    // Tax deductions (if included)
    const sssEmployee = includeTaxes ? (employeeData.sssEmployee || 0) : 0;
    const sssEmployer = includeTaxes ? (employeeData.sssEmployer || 0) : 0;
    const pagibigEmployee = includeTaxes ? (employeeData.pagibigEmployee || 0) : 0;
    const pagibigEmployer = includeTaxes ? (employeeData.pagibigEmployer || 0) : 0;
    const philhealthEmployee = includeTaxes ? (employeeData.philhealthEmployee || 0) : 0;
    const philhealthEmployer = includeTaxes ? (employeeData.philhealthEmployer || 0) : 0;
    const birTax = includeTaxes ? (employeeData.birTax || 0) : 0;

    const totalTaxDeductions = includeTaxes ?
      (sssEmployee + pagibigEmployee + philhealthEmployee + birTax) : 0;

    const totalEmployerContributions = includeTaxes ?
      (sssEmployer + pagibigEmployer + philhealthEmployer) : 0;

    const totalDeductions = refreshment + totalLate + totalUndertime + totalAbsent + totalTaxDeductions + (cashAdvance || 0);

    const netPay = basicPay + (allowance || 0) + (transpoAllowance || 0) + otPay - totalDeductions;

    const payrollData = {
      employeeId,
      employeeName,
      companyId,
      companyName: employeeData.companyName || '',
      month: new Date(cutoffStartDate).toISOString().slice(0, 7),
      cutoffStartDate,
      cutoffEndDate,
      payDate,
      payrollKey: `${employeeId}_${cutoffStartDate}_${cutoffEndDate}_${payDate}`,
      workingDays,
      basicPay,
      allowance: allowance || 0,
      transpoAllowance: transpoAllowance || 0,
      refreshment: refreshment || 0,
      mins: mins || 0,
      absent: absent || 0,
      halfDay: halfDay || 0,
      otMinutes: otMinutes || 0,
      undertimeMinutes: undertimeMinutes || 0,
      dailyRate,
      perHour,
      perMinute,
      totalLate,
      totalUndertime,
      absentValue,
      halfDayValue,
      totalAbsent,
      otPay,
      includeTaxes: includeTaxes || false,
      sssEmployee,
      sssEmployer,
      pagibigEmployee,
      pagibigEmployer,
      philhealthEmployee,
      philhealthEmployer,
      birTax,
      totalTaxDeductions,
      totalEmployerContributions,
      netPay,
      cashAdvance: cashAdvance || 0,
      memo: memo || 0,
      department: employeeData.department || 'N/A',
      position: employeeData.position || 'N/A',
      bankAccount: employeeData.bankAccount || 'N/A',
      idNumber: employeeData.idNumber || employeeData.employeeId || 'N/A',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Save payroll to Firestore
    const payrollRef = db.collection('payrolls').doc(payrollData.payrollKey);
    await payrollRef.set(payrollData);

    console.log('? Payroll calculated and saved for employee:', employeeId);

    await logActivitySafe({
      module: 'hr',
      action: 'PAYROLL_GENERATED',
      companyId,
      entityType: 'employee',
      entityId: employeeId,
      summary: 'Payroll generated for employee ' + employeeId,
      metadata: {
        payrollKey: payrollData.payrollKey,
        payDate,
        cutoffStartDate,
        cutoffEndDate,
        netPay: Number(payrollData.netPay) || 0,
        includeTaxes: Boolean(includeTaxes),
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    res.json({
      success: true,
      payroll: payrollData,
      message: 'Payroll calculated and saved successfully'
    });

  } catch (error) {
    console.error('❌ Error calculating payroll:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk calculate payroll for multiple employees
router.post('/bulk', async (req, res) => {
  try {
    const { employees, companyId: bodyCompanyId } = req.body;

    console.log(`🔍 Bulk calculating payroll for ${employees.length} employees`);

    if (!employees || !Array.isArray(employees)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid employees array'
      });
    }

    const results = [];
    const batch = db.batch();

    for (const employeePayroll of employees) {
      try {
        // Use the same calculation logic as single employee
        const result = await calculateSinglePayroll(employeePayroll);
        results.push({
          employeeId: employeePayroll.employeeId,
          success: true,
          payroll: result
        });

        // Add to batch
        const payrollRef = db.collection('payrolls').doc(result.payrollKey);
        batch.set(payrollRef, result);

      } catch (error) {
        results.push({
          employeeId: employeePayroll.employeeId,
          success: false,
          error: error.message
        });
      }
    }

    // Commit batch
    await batch.commit();

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`✅ Bulk payroll completed: ${successCount} success, ${failureCount} failures`);

    await logActivitySafe({
      module: 'hr',
      action: 'PAYROLL_BULK_GENERATED',
      companyId: bodyCompanyId || req.user?.token?.companyId || null,
      entityType: 'batch',
      entityId: null,
      summary: 'Bulk payroll processed for ' + employees.length + ' employees',
      metadata: {
        total: employees.length,
        success: successCount,
        failures: failureCount,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    res.json({
      success: true,
      results,
      summary: {
        total: employees.length,
        success: successCount,
        failures: failureCount
      },
      message: `Processed ${successCount}/${employees.length} payrolls successfully`
    });

  } catch (error) {
    console.error('❌ Error bulk calculating payroll:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save (or update) a payroll record computed on the client
router.post('/save-record', async (req, res) => {
  try {
    const { payroll } = req.body || {};

    if (!payroll || typeof payroll !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing payroll payload',
      });
    }

    const sanitized = sanitizePayrollRecord(payroll);
    const missing = REQUIRED_PAYROLL_FIELDS.filter(
      (field) => !sanitized[field] || sanitized[field] === ''
    );

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required payroll fields: ${missing.join(', ')}`,
      });
    }

    const docRef = db.collection('payrolls').doc(String(sanitized.payrollKey));

    let existingCreatedAt = null;
    let existedBefore = false;
    try {
      const existingSnapshot = await docRef.get();
      if (existingSnapshot.exists) {
        existedBefore = true;
        const data = existingSnapshot.data();
        existingCreatedAt =
          data?.createdAt ||
          data?.created_at ||
          admin.firestore.FieldValue.serverTimestamp();
      }
    } catch (readError) {
      console.warn('Unable to read existing payroll metadata:', readError);
    }

    await docRef.set(
      {
        ...sanitized,
        createdAt:
          existingCreatedAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const savedSnapshot = await docRef.get();
    const savedData = savedSnapshot.exists ? savedSnapshot.data() : sanitized;

    await logActivitySafe({
      module: 'hr',
      action: existedBefore ? 'PAYROLL_RECORD_UPDATED' : 'PAYROLL_RECORD_CREATED',
      companyId: sanitized.companyId || req.user?.token?.companyId || null,
      entityType: 'employee',
      entityId: sanitized.employeeId || null,
      summary: `${existedBefore ? 'Updated' : 'Saved'} payroll record for employee ${sanitized.employeeId || 'unknown'}`,
      metadata: {
        payrollKey: sanitized.payrollKey,
        payDate: sanitized.payDate || null,
        cutoffStartDate: sanitized.cutoffStartDate || null,
        cutoffEndDate: sanitized.cutoffEndDate || null,
        wasUpdate: existedBefore,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    res.json({
      success: true,
      payroll: {
        id: savedSnapshot.id,
        ...savedData,
      },
      message: 'Payroll record saved successfully',
    });
  } catch (error) {
    console.error('Error saving payroll record:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to save payroll record',
    });
  }
});

// Delete payroll for a period
router.post('/delete-period', async (req, res) => {
  try {
    const { companyId, payDate, cutoffStartDate, cutoffEndDate } = req.body;

    console.log('🔍 Deleting payroll period:', { companyId, payDate, cutoffStartDate, cutoffEndDate });

    if (!companyId || !payDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, payDate'
      });
    }

    let query = db.collection('payrolls')
      .where('companyId', '==', companyId)
      .where('payDate', '==', payDate);

    if (cutoffStartDate) {
      query = query.where('cutoffStartDate', '==', cutoffStartDate);
    }
    if (cutoffEndDate) {
      query = query.where('cutoffEndDate', '==', cutoffEndDate);
    }

    const snapshot = await query.get();

    if (snapshot.docs.length === 0) {
      return res.json({
        success: true,
        deleted: 0,
        message: 'No payroll records found for the specified period'
      });
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`✅ Deleted ${snapshot.docs.length} payroll records`);

    await logActivitySafe({
      module: 'hr',
      action: 'PAYROLL_PERIOD_DELETED',
      companyId,
      entityType: 'company',
      entityId: companyId,
      summary: 'Deleted ' + snapshot.docs.length + ' payroll records for ' + payDate,
      metadata: {
        payDate,
        cutoffStartDate: cutoffStartDate || null,
        cutoffEndDate: cutoffEndDate || null,
        deletedCount: snapshot.docs.length,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    res.json({
      success: true,
      deleted: snapshot.docs.length,
      message: `Deleted ${snapshot.docs.length} payroll records for the period`
    });

  } catch (error) {
    console.error('❌ Error deleting payroll period:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete payroll for a specific employee
router.post('/delete-employee', async (req, res) => {
  try {
    const { companyId, payDate, employeeId, cutoffStartDate, cutoffEndDate } = req.body;

    console.log('🔍 Deleting payroll for employee:', { companyId, payDate, employeeId });

    if (!companyId || !payDate || !employeeId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, payDate, employeeId'
      });
    }

    let query = db.collection('payrolls')
      .where('companyId', '==', companyId)
      .where('payDate', '==', payDate)
      .where('employeeId', '==', employeeId);

    if (cutoffStartDate) {
      query = query.where('cutoffStartDate', '==', cutoffStartDate);
    }
    if (cutoffEndDate) {
      query = query.where('cutoffEndDate', '==', cutoffEndDate);
    }

    const snapshot = await query.get();

    if (snapshot.docs.length === 0) {
      return res.json({
        success: true,
        message: 'No payroll records found for the employee'
      });
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`✅ Deleted ${snapshot.docs.length} payroll record(s) for employee ${employeeId}`);

    await logActivitySafe({
      module: 'hr',
      action: 'PAYROLL_EMPLOYEE_DELETED',
      companyId,
      entityType: 'employee',
      entityId: employeeId,
      summary: 'Deleted ' + snapshot.docs.length + ' payroll record(s) for employee ' + employeeId,
      metadata: {
        payDate,
        employeeId,
        cutoffStartDate: cutoffStartDate || null,
        cutoffEndDate: cutoffEndDate || null,
        deletedCount: snapshot.docs.length,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    res.json({
      success: true,
      message: `Deleted ${snapshot.docs.length} payroll record(s) for employee`
    });

  } catch (error) {
    console.error('❌ Error deleting employee payroll:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;








