const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const PAYROLLS_COLLECTION = 'payrolls';
const TRAINEE_PAYROLL_COLLECTION = 'traineePayroll';
const EMPLOYEES_COLLECTION = 'employees';
const ATTENDANCE_SUMMARIES_COLLECTION = 'attendanceSummaries';

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

const safeString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
};

/**
 * Validate report query parameters
 * @param {object} query - Report query parameters
 * @returns {array} Validation errors
 */
const validateReportQuery = (query) => {
  const errors = [];

  if (!safeString(query.companyId)) {
    errors.push('companyId is required');
  }

  if (!safeString(query.startDate)) {
    errors.push('startDate is required');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(query.startDate)) {
    errors.push('startDate must be in YYYY-MM-DD format');
  }

  if (!safeString(query.endDate)) {
    errors.push('endDate is required');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(query.endDate)) {
    errors.push('endDate must be in YYYY-MM-DD format');
  }

  if (query.startDate && query.endDate && query.startDate > query.endDate) {
    errors.push('startDate must be before endDate');
  }

  return errors;
};

/**
 * Generate payroll report for specified period and filters
 * @param {object} payload - Report parameters
 * @param {object} options - Contains userId, email
 * @returns {object} Formatted payroll report data
 */
const generatePayrollReport = async (payload = {}, options = {}) => {
  try {
    const errors = validateReportQuery(payload);
    if (errors.length > 0) {
      throw createServiceError('invalid-argument', `Validation errors: ${errors.join(', ')}`, errors);
    }

    const companyId = safeString(payload.companyId);
    const startDate = safeString(payload.startDate);
    const endDate = safeString(payload.endDate);
    const department = payload.department ? safeString(payload.department) : null;
    const employeeId = payload.employeeId ? safeString(payload.employeeId) : null;
    const pageSize = toNumber(payload.pageSize, 100);
    const pageNumber = toNumber(payload.pageNumber, 1);

    const db = firestore();

    // Build query
    let query = db.collection(PAYROLLS_COLLECTION);

    // Add filters
    query = query.where('companyId', '==', companyId);
    query = query.where('payDate', '>=', startDate);
    query = query.where('payDate', '<=', endDate);

    if (department) {
      query = query.where('department', '==', department);
    }

    if (employeeId) {
      query = query.where('employeeId', '==', employeeId);
    }

    // Get total count
    const countSnapshot = await query.count().get();
    const totalCount = countSnapshot.data().count;

    // Get paginated results
    const offset = (pageNumber - 1) * pageSize;
    const snapshot = await query
      .orderBy('payDate', 'desc')
      .orderBy('employeeName', 'asc')
      .limit(pageSize)
      .offset(offset)
      .get();

    // Process records and calculate totals
    const records = [];
    const totals = {
      totalEarnings: 0,
      totalDeductions: 0,
      totalNetPay: 0,
      totalOvertimePay: 0,
      totalTaxDeductions: 0,
      totalEmployerContributions: 0,
      totalAllowances: 0,
      totalAbsentDeductions: 0,
      totalLateDeductions: 0,
      totalUndertimeDeductions: 0,
      recordCount: 0,
    };

    snapshot.forEach((doc) => {
      const data = doc.data();
      const record = {
        id: doc.id,
        employeeId: data.employeeId,
        employeeName: data.employeeName,
        department: data.department,
        position: data.position,
        bank: data.bankAccount,
        basicPay: toNumber(data.basicPay),
        allowances: toNumber(data.allowance) + toNumber(data.transpoAllowance),
        overtimePay: toNumber(data.otPay),
        grossPay: toNumber(data.grossPay),
        absences: toNumber(data.totalAbsent),
        latePay: toNumber(data.totalLate),
        undertimePay: toNumber(data.totalUndertime),
        cashAdvance: toNumber(data.cashAdvance),
        taxDeductions: toNumber(data.totalTaxDeductions),
        employerContributions: toNumber(data.totalEmployerContributions),
        totalDeductions: toNumber(data.totalDeductions),
        netPay: toNumber(data.netPay),
        payDate: data.payDate,
        cutoffStartDate: data.cutoffStartDate,
        cutoffEndDate: data.cutoffEndDate,
      };

      records.push(record);

      // Accumulate totals
      totals.totalEarnings += record.grossPay;
      totals.totalDeductions += record.totalDeductions;
      totals.totalNetPay += record.netPay;
      totals.totalOvertimePay += record.overtimePay;
      totals.totalTaxDeductions += record.taxDeductions;
      totals.totalEmployerContributions += record.employerContributions;
      totals.totalAllowances += record.allowances;
      totals.totalAbsentDeductions += record.absences;
      totals.totalLateDeductions += record.latePay;
      totals.totalUndertimeDeductions += record.undertimePay;
      totals.recordCount += 1;
    });

    // Calculate averages
    const averages = {
      averageGrossPay: totals.recordCount > 0 ? Math.round(totals.totalEarnings / totals.recordCount) : 0,
      averageNetPay: totals.recordCount > 0 ? Math.round(totals.totalNetPay / totals.recordCount) : 0,
      averageTaxDeductions:
        totals.recordCount > 0 ? Math.round(totals.totalTaxDeductions / totals.recordCount) : 0,
    };

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      success: true,
      reportData: {
        period: {
          startDate,
          endDate,
          department: department || 'all',
          employeeId: employeeId || 'all',
          companyId,
        },
        records,
        totals: {
          ...totals,
          ...averages,
        },
        pagination: {
          currentPage: pageNumber,
          pageSize,
          totalItems: totalCount,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPreviousPage: pageNumber > 1,
        },
      },
      generatedAt: new Date().toISOString(),
      message: `Payroll report generated with ${totalCount} records`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to generate payroll report: ${error.message}`);
  }
};

/**
 * Generate company-wide report with department aggregation
 * @param {object} payload - Report parameters
 * @param {object} options - Contains userId, email
 * @returns {object} Aggregated company report data
 */
const generateCompanyReport = async (payload = {}, options = {}) => {
  try {
    const errors = validateReportQuery(payload);
    if (errors.length > 0) {
      throw createServiceError('invalid-argument', `Validation errors: ${errors.join(', ')}`, errors);
    }

    const companyId = safeString(payload.companyId);
    const startDate = safeString(payload.startDate);
    const endDate = safeString(payload.endDate);

    const db = firestore();

    // Query all payroll records for the company and period
    const snapshot = await db
      .collection(PAYROLLS_COLLECTION)
      .where('companyId', '==', companyId)
      .where('payDate', '>=', startDate)
      .where('payDate', '<=', endDate)
      .get();

    // Aggregate by department
    const departmentTotals = {};
    const payPeriods = new Set();
    let companyTotals = {
      totalEarnings: 0,
      totalDeductions: 0,
      totalNetPay: 0,
      totalEmployees: 0,
      totalOvertimePay: 0,
      totalTaxDeductions: 0,
      totalEmployerContributions: 0,
      totalAllowances: 0,
      totalAbsentDeductions: 0,
    };

    snapshot.forEach((doc) => {
      const data = doc.data();
      const dept = data.department || 'Unassigned';
      const grossPay = toNumber(data.grossPay);
      const netPay = toNumber(data.netPay);
      const totalDeductions = toNumber(data.totalDeductions);
      const otPay = toNumber(data.otPay);
      const taxDeductions = toNumber(data.totalTaxDeductions);
      const employerContributions = toNumber(data.totalEmployerContributions);
      const allowances = toNumber(data.allowance) + toNumber(data.transpoAllowance);

      // Track pay periods
      if (data.payDate) {
        payPeriods.add(data.payDate);
      }

      // Initialize department if not exists
      if (!departmentTotals[dept]) {
        departmentTotals[dept] = {
          departmentName: dept,
          employeeCount: 0,
          totalEarnings: 0,
          totalDeductions: 0,
          totalNetPay: 0,
          totalOvertimePay: 0,
          totalTaxDeductions: 0,
          totalEmployerContributions: 0,
          totalAllowances: 0,
        };
      }

      // Aggregate department data
      departmentTotals[dept].employeeCount += 1;
      departmentTotals[dept].totalEarnings += grossPay;
      departmentTotals[dept].totalDeductions += totalDeductions;
      departmentTotals[dept].totalNetPay += netPay;
      departmentTotals[dept].totalOvertimePay += otPay;
      departmentTotals[dept].totalTaxDeductions += taxDeductions;
      departmentTotals[dept].totalEmployerContributions += employerContributions;
      departmentTotals[dept].totalAllowances += allowances;

      // Aggregate company totals
      companyTotals.totalEarnings += grossPay;
      companyTotals.totalDeductions += totalDeductions;
      companyTotals.totalNetPay += netPay;
      companyTotals.totalEmployees += 1;
      companyTotals.totalOvertimePay += otPay;
      companyTotals.totalTaxDeductions += taxDeductions;
      companyTotals.totalEmployerContributions += employerContributions;
      companyTotals.totalAllowances += allowances;
    });

    // Calculate averages for departments
    const departmentsSummary = Object.values(departmentTotals).map((dept) => ({
      ...dept,
      averageGrossPay: dept.employeeCount > 0 ? Math.round(dept.totalEarnings / dept.employeeCount) : 0,
      averageNetPay: dept.employeeCount > 0 ? Math.round(dept.totalNetPay / dept.employeeCount) : 0,
      averageTaxDeductions:
        dept.employeeCount > 0 ? Math.round(dept.totalTaxDeductions / dept.employeeCount) : 0,
    }));

    // Sort by department name
    departmentsSummary.sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    // Calculate company averages
    companyTotals.averageGrossPay =
      companyTotals.totalEmployees > 0 ? Math.round(companyTotals.totalEarnings / companyTotals.totalEmployees) : 0;
    companyTotals.averageNetPay =
      companyTotals.totalEmployees > 0 ? Math.round(companyTotals.totalNetPay / companyTotals.totalEmployees) : 0;
    companyTotals.averageTaxDeductions =
      companyTotals.totalEmployees > 0 ? Math.round(companyTotals.totalTaxDeductions / companyTotals.totalEmployees) : 0;

    return {
      success: true,
      reportData: {
        period: {
          startDate,
          endDate,
          payPeriods: Array.from(payPeriods).sort(),
          companyId,
        },
        companyTotals,
        departmentsSummary,
        departmentCount: departmentsSummary.length,
      },
      generatedAt: new Date().toISOString(),
      message: `Company report generated for ${companyTotals.totalEmployees} employees across ${departmentsSummary.length} departments`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to generate company report: ${error.message}`);
  }
};

/**
 * Generate attendance report with statistics
 * @param {object} payload - Report parameters
 * @param {object} options - Contains userId, email
 * @returns {object} Attendance report data
 */
const generateAttendanceReport = async (payload = {}, options = {}) => {
  try {
    const errors = validateReportQuery(payload);
    if (errors.length > 0) {
      throw createServiceError('invalid-argument', `Validation errors: ${errors.join(', ')}`, errors);
    }

    const companyId = safeString(payload.companyId);
    const startDate = safeString(payload.startDate);
    const endDate = safeString(payload.endDate);
    const department = payload.department ? safeString(payload.department) : null;

    const db = firestore();

    // Query attendance records
    let query = db.collection(ATTENDANCE_SUMMARIES_COLLECTION);
    query = query.where('date', '>=', startDate);
    query = query.where('date', '<=', endDate);

    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }

    const snapshot = await query.get();

    // Process attendance data
    const departmentStats = {};
    let companyStats = {
      totalRecords: 0,
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      lateDays: 0,
      earlyOutDays: 0,
      overtimeDays: 0,
      totalMinutesLate: 0,
      totalMinutesEarly: 0,
      totalMinutesOvertime: 0,
      totalMinutesUndertime: 0,
    };

    snapshot.forEach((doc) => {
      const data = doc.data();

      companyStats.totalRecords += 1;

      if (data.isAbsent) {
        companyStats.absentDays += 1;
      } else {
        companyStats.presentDays += 1;
      }

      if (data.isHalfDay) {
        companyStats.halfDays += 1;
      }

      if (data.minutesLate > 0) {
        companyStats.lateDays += 1;
        companyStats.totalMinutesLate += data.minutesLate;
      }

      if (data.minutesEarly > 0) {
        companyStats.earlyOutDays += 1;
        companyStats.totalMinutesEarly += data.minutesEarly;
      }

      if (data.minutesOvertime > 0) {
        companyStats.overtimeDays += 1;
        companyStats.totalMinutesOvertime += data.minutesOvertime;
      }

      companyStats.totalMinutesUndertime += data.minutesUndertime || 0;
    });

    // Calculate averages
    const statistics = {
      ...companyStats,
      averageMinutesLate: companyStats.lateDays > 0 ? Math.round(companyStats.totalMinutesLate / companyStats.lateDays) : 0,
      averageMinutesEarly:
        companyStats.earlyOutDays > 0 ? Math.round(companyStats.totalMinutesEarly / companyStats.earlyOutDays) : 0,
      averageMinutesOvertime:
        companyStats.overtimeDays > 0 ? Math.round(companyStats.totalMinutesOvertime / companyStats.overtimeDays) : 0,
      presentRate:
        companyStats.totalRecords > 0 ? Math.round((companyStats.presentDays / companyStats.totalRecords) * 100) : 0,
      absentRate:
        companyStats.totalRecords > 0 ? Math.round((companyStats.absentDays / companyStats.totalRecords) * 100) : 0,
    };

    return {
      success: true,
      reportData: {
        period: {
          startDate,
          endDate,
          companyId,
          department: department || 'all',
        },
        statistics,
      },
      generatedAt: new Date().toISOString(),
      message: `Attendance report generated for ${companyStats.totalRecords} records`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to generate attendance report: ${error.message}`);
  }
};

/**
 * Generate tax and deductions report
 * @param {object} payload - Report parameters
 * @param {object} options - Contains userId, email
 * @returns {object} Tax and deductions summary
 */
const generateTaxReport = async (payload = {}, options = {}) => {
  try {
    const errors = validateReportQuery(payload);
    if (errors.length > 0) {
      throw createServiceError('invalid-argument', `Validation errors: ${errors.join(', ')}`, errors);
    }

    const companyId = safeString(payload.companyId);
    const startDate = safeString(payload.startDate);
    const endDate = safeString(payload.endDate);

    const db = firestore();

    // Query payroll records
    const snapshot = await db
      .collection(PAYROLLS_COLLECTION)
      .where('companyId', '==', companyId)
      .where('payDate', '>=', startDate)
      .where('payDate', '<=', endDate)
      .get();

    // Aggregate tax and deduction data
    let totals = {
      employeeCount: 0,
      totalSSSEmployee: 0,
      totalSSSEmployer: 0,
      totalPagibigEmployee: 0,
      totalPagibigEmployer: 0,
      totalPhilhealthEmployee: 0,
      totalPhilhealthEmployer: 0,
      totalBIRTax: 0,
      totalCashAdvance: 0,
      totalMemo: 0,
      totalEmployeeDeductions: 0,
      totalEmployerContributions: 0,
    };

    snapshot.forEach((doc) => {
      const data = doc.data();
      totals.employeeCount += 1;
      totals.totalSSSEmployee += toNumber(data.sssEmployee);
      totals.totalSSSEmployer += toNumber(data.sssEmployer);
      totals.totalPagibigEmployee += toNumber(data.pagibigEmployee);
      totals.totalPagibigEmployer += toNumber(data.pagibigEmployer);
      totals.totalPhilhealthEmployee += toNumber(data.philhealthEmployee);
      totals.totalPhilhealthEmployer += toNumber(data.philhealthEmployer);
      totals.totalBIRTax += toNumber(data.birTax);
      totals.totalCashAdvance += toNumber(data.cashAdvance);
      totals.totalMemo += toNumber(data.memo);
      totals.totalEmployeeDeductions += toNumber(data.totalTaxDeductions);
      totals.totalEmployerContributions += toNumber(data.totalEmployerContributions);
    });

    // Calculate averages and percentages
    const analysis = {
      ...totals,
      averageSSSEmployee: totals.employeeCount > 0 ? Math.round(totals.totalSSSEmployee / totals.employeeCount) : 0,
      averageBIRTax: totals.employeeCount > 0 ? Math.round(totals.totalBIRTax / totals.employeeCount) : 0,
      totalStatutoryDeductions: totals.totalSSSEmployee + totals.totalPagibigEmployee + totals.totalPhilhealthEmployee + totals.totalBIRTax,
    };

    return {
      success: true,
      reportData: {
        period: {
          startDate,
          endDate,
          companyId,
        },
        analysis,
      },
      generatedAt: new Date().toISOString(),
      message: `Tax report generated for ${totals.employeeCount} employees`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to generate tax report: ${error.message}`);
  }
};

/**
 * Generate trainee payroll report
 * @param {object} payload - Report parameters
 * @param {object} options - Contains userId, email
 * @returns {object} Trainee payroll summary
 */
const generateTraineePayrollReport = async (payload = {}, options = {}) => {
  try {
    const companyId = safeString(payload.companyId);
    const startDate = safeString(payload.startDate);
    const endDate = safeString(payload.endDate);

    if (!companyId || !startDate || !endDate) {
      throw createServiceError(
        'invalid-argument',
        'companyId, startDate, and endDate are required'
      );
    }

    const db = firestore();

    // Query trainee payroll documents
    const snapshot = await db
      .collection(TRAINEE_PAYROLL_COLLECTION)
      .where('cutoffStartDate', '>=', startDate)
      .where('cutoffEndDate', '<=', endDate)
      .get();

    const records = [];
    let companyTotals = {
      totalRecords: 0,
      totalNetPay: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      totalTaxes: 0,
    };

    // Process each trainee payroll period
    for (const doc of snapshot.docs) {
      const periodData = doc.data();

      // Get individual trainee records from subcollection
      const traineesSnapshot = await doc.ref.collection('payrolls').get();

      traineesSnapshot.forEach((traineeDoc) => {
        const traineeData = traineeDoc.data();
        const netPay = toNumber(traineeData.netPay);
        const earnings = toNumber(traineeData.basicPay) + toNumber(traineeData.otPay) + toNumber(traineeData.allowance);
        const deductions = toNumber(traineeData.totalDeductions) || 0;

        records.push({
          employeeId: traineeData.employeeId,
          employeeName: traineeData.employeeName,
          department: traineeData.department,
          position: traineeData.position,
          basicPay: toNumber(traineeData.basicPay),
          allowances: toNumber(traineeData.allowance) + toNumber(traineeData.transpoAllowance),
          overtimePay: toNumber(traineeData.otPay),
          earnings,
          taxDeductions: toNumber(traineeData.totalTaxDeductions),
          deductions,
          netPay,
          payDate: periodData.payDate,
          cutoffStartDate: periodData.cutoffStartDate,
          cutoffEndDate: periodData.cutoffEndDate,
        });

        companyTotals.totalRecords += 1;
        companyTotals.totalNetPay += netPay;
        companyTotals.totalEarnings += earnings;
        companyTotals.totalDeductions += deductions;
        companyTotals.totalTaxes += toNumber(traineeData.totalTaxDeductions);
      });
    }

    return {
      success: true,
      reportData: {
        period: {
          startDate,
          endDate,
          companyId,
        },
        records,
        totals: {
          ...companyTotals,
          averageNetPay: companyTotals.totalRecords > 0 ? Math.round(companyTotals.totalNetPay / companyTotals.totalRecords) : 0,
        },
      },
      generatedAt: new Date().toISOString(),
      message: `Trainee payroll report generated for ${companyTotals.totalRecords} records`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to generate trainee payroll report: ${error.message}`);
  }
};

module.exports = {
  generatePayrollReport,
  generateCompanyReport,
  generateAttendanceReport,
  generateTaxReport,
  generateTraineePayrollReport,
  validateReportQuery,
};
