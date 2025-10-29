const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const router = express.Router();

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();
// Initialize Firestore
const db = admin.firestore();

// Basic report functions phase 4 - placeholder implementation
router.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Report functions phase 4 module loaded' });
});

/**
 * Generate payroll report (regular employees)
 * POST /reports/v4/payroll
 * Body: { companyId, startDate, endDate, pageSize, pageNumber }
 */
router.post('/payroll', async (req, res) => {
  try {
    const { companyId, startDate, endDate, pageSize = 100, pageNumber = 1 } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    console.log('📊 Generating regular payroll report:', { companyId, startDate, endDate, pageSize, pageNumber });

    // Query payrolls collection
    let query = db.collection('payrolls').where('companyId', '==', companyId);

    // Filter by date range if provided
    if (startDate) {
      query = query.where('payDate', '>=', startDate);
    }
    if (endDate) {
      query = query.where('payDate', '<=', endDate);
    }

    // Get all matching records
    const snapshot = await query.get();
    const allRecords = [];

    // Process each payroll record
    snapshot.forEach((doc) => {
      const payrollData = doc.data();
      allRecords.push({
        id: doc.id,
        ...payrollData,
      });
    });

    // Calculate totals and statistics
    let totals = {
      basicPay: 0,
      allowance: 0,
      transpoAllowance: 0,
      otPay: 0,
      totalEarnings: 0,
      refreshment: 0,
      cashAdvance: 0,
      totalLate: 0,
      totalUndertime: 0,
      absentValue: 0,
      halfDayValue: 0,
      totalTaxDeductions: 0,
      totalDeductions: 0,
      netPay: 0,
      recordCount: 0,
    };

    const recordsByDepartment = {};

    allRecords.forEach((record) => {
      const basicPay = Number(record.basicPay) || 0;
      const allowance = Number(record.allowance) || 0;
      const transpoAllowance = Number(record.transpoAllowance) || 0;
      const otPay = Number(record.otPay) || 0;
      const refreshment = Number(record.refreshment) || 0;
      const cashAdvance = Number(record.cashAdvance) || 0;
      const totalLate = Number(record.totalLate) || 0;
      const totalUndertime = Number(record.totalUndertime) || 0;
      const absentValue = Number(record.absentValue) || 0;
      const halfDayValue = Number(record.halfDayValue) || 0;
      const totalTaxDeductions = Number(record.totalTaxDeductions) || 0;
      const totalDeductions = Number(record.totalDeductions) || 0;
      const netPay = Number(record.netPay) || 0;

      // Add to totals
      totals.basicPay += basicPay;
      totals.allowance += allowance;
      totals.transpoAllowance += transpoAllowance;
      totals.otPay += otPay;
      totals.totalEarnings += basicPay + allowance + transpoAllowance + otPay;
      totals.refreshment += refreshment;
      totals.cashAdvance += cashAdvance;
      totals.totalLate += totalLate;
      totals.totalUndertime += totalUndertime;
      totals.absentValue += absentValue;
      totals.halfDayValue += halfDayValue;
      totals.totalTaxDeductions += totalTaxDeductions;
      totals.totalDeductions += totalDeductions;
      totals.netPay += netPay;
      totals.recordCount++;

      // Group by department
      const department = record.department || 'Unassigned';
      if (!recordsByDepartment[department]) {
        recordsByDepartment[department] = {
          department,
          count: 0,
          totalEarnings: 0,
          totalDeductions: 0,
          totalNetPay: 0,
        };
      }
      recordsByDepartment[department].count++;
      recordsByDepartment[department].totalEarnings += basicPay + allowance + transpoAllowance + otPay;
      recordsByDepartment[department].totalDeductions += totalDeductions;
      recordsByDepartment[department].totalNetPay += netPay;
    });

    // Round totals to 2 decimal places
    Object.keys(totals).forEach((key) => {
      if (typeof totals[key] === 'number' && key !== 'recordCount') {
        totals[key] = Math.round(totals[key] * 100) / 100;
      }
    });

    // Calculate averages
    const averages = {
      basicPay: totals.recordCount > 0 ? Math.round((totals.basicPay / totals.recordCount) * 100) / 100 : 0,
      allowance: totals.recordCount > 0 ? Math.round((totals.allowance / totals.recordCount) * 100) / 100 : 0,
      totalEarnings: totals.recordCount > 0 ? Math.round((totals.totalEarnings / totals.recordCount) * 100) / 100 : 0,
      totalDeductions: totals.recordCount > 0 ? Math.round((totals.totalDeductions / totals.recordCount) * 100) / 100 : 0,
      netPay: totals.recordCount > 0 ? Math.round((totals.netPay / totals.recordCount) * 100) / 100 : 0,
    };

    console.log(`✅ Found ${allRecords.length} payroll records for company: ${companyId}`);

    res.json({
      success: true,
      reportData: {
        records: allRecords,
        totalRecords: allRecords.length,
        totals,
        averages,
        departmentBreakdown: Object.values(recordsByDepartment),
        companyId,
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Error generating payroll report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate payroll report',
      error: error.message,
    });
  }
});

/**
 * Generate trainee payroll report
 * Query params: companyId, startDate, endDate
 */
router.get('/trainee-payroll', async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    console.log('📊 Generating trainee payroll report:', { companyId, startDate, endDate });

    // Query traineePayroll collection filtered by companyId
    let traineePayrollQuery = db.collection('traineePayroll').where('companyId', '==', companyId);

    const snapshot = await traineePayrollQuery.get();

    const allRecords = [];

    // Process each summary document
    for (const summaryDoc of snapshot.docs) {
      const summaryData = summaryDoc.data();
      const { payDate, cutoffStartDate, cutoffEndDate, workingDays } = summaryData;

      // Filter by date range if provided
      if (startDate && payDate < startDate) continue;
      if (endDate && payDate > endDate) continue;

      // Get individual payroll records from subcollection
      const payrollsRef = db.collection('traineePayroll').doc(summaryDoc.id).collection('payrolls');
      const payrollsSnapshot = await payrollsRef.get();

      // Add each payroll record with period info, filtering by companyId
      payrollsSnapshot.forEach((payrollDoc) => {
        const payrollData = payrollDoc.data();
        // Double-check companyId matches
        if (payrollData.companyId === companyId) {
          allRecords.push({
            ...payrollData,
            payDate: payDate || payrollData.payDate,
            cutoffStartDate: cutoffStartDate || payrollData.cutoffStartDate || 'N/A',
            cutoffEndDate: cutoffEndDate || payrollData.cutoffEndDate || 'N/A',
            workingDays: workingDays || payrollData.workingDays || 'N/A',
          });
        }
      });
    }

    console.log(`✅ Found ${allRecords.length} trainee payroll records for company: ${companyId}`);

    res.json({
      success: true,
      reportData: {
        records: allRecords,
        totalRecords: allRecords.length,
        companyId,
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Error generating trainee payroll report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate trainee payroll report',
      error: error.message,
    });
  }
});

module.exports = router;
