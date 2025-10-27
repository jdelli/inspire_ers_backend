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
