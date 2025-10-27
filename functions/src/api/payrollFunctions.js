const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();
const db = admin.firestore();
const router = express.Router();

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

    console.log('✅ Payroll calculated and saved for employee:', employeeId);

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
    const { employees } = req.body;

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
