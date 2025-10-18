const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;
const TIME_RECORDS_COLLECTION = 'timeRecords';
const ATTENDANCE_SUMMARIES_COLLECTION = 'attendanceSummaries';
const EMPLOYEE_SCHEDULES_COLLECTION = 'employeeSchedules';
const EMPLOYEES_COLLECTION = 'employees';

const DEFAULT_WORK_HOURS = 8;
const LUNCH_BREAK_MINUTES = 60;
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '17:00';

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
 * Parse time string in HH:MM format to minutes
 * @param {string} timeStr - Time in HH:MM format
 * @returns {number} Minutes since midnight
 */
const timeStringToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') {
    return 0;
  }
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
};

/**
 * Convert minutes to HH:MM time string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time in HH:MM format
 */
const minutesToTimeString = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Parse ISO datetime to minutes since midnight
 * @param {string} isoDateTime - ISO datetime string
 * @returns {number} Minutes since midnight
 */
const isoToMinutes = (isoDateTime) => {
  if (!isoDateTime) {
    return 0;
  }
  try {
    const date = new Date(isoDateTime);
    return date.getHours() * 60 + date.getMinutes();
  } catch {
    return 0;
  }
};

/**
 * Get employee schedule for a specific date
 * @param {string} employeeId - Employee ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {object} Schedule with startTime and endTime
 */
const getEmployeeSchedule = async (employeeId, date) => {
  try {
    const db = firestore();
    const scheduleRef = db
      .collection(EMPLOYEE_SCHEDULES_COLLECTION)
      .where('employeeId', '==', employeeId)
      .where('effectiveDate', '<=', date)
      .orderBy('effectiveDate', 'desc')
      .limit(1);

    const snapshot = await scheduleRef.get();

    if (!snapshot.empty) {
      return snapshot.docs[0].data();
    }

    // Return default schedule if none found
    return {
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    };
  } catch (error) {
    // Return default schedule on error
    return {
      startTime: DEFAULT_START_TIME,
      endTime: DEFAULT_END_TIME,
    };
  }
};

/**
 * Calculate time status and durations from time record
 * @param {object} timeRecord - Record with timeIn, timeOut, and other fields
 * @param {object} schedule - Employee schedule with startTime and endTime
 * @returns {object} Calculated status and durations
 */
const calculateTimeStatus = (timeRecord, schedule) => {
  const timeIn = isoToMinutes(timeRecord.timeIn);
  const timeOut = isoToMinutes(timeRecord.timeOut);
  const workStartTime = timeStringToMinutes(schedule.startTime);
  const workEndTime = timeStringToMinutes(schedule.endTime);

  let timeStatus = 'No Record';
  let minutesLate = 0;
  let minutesEarly = 0;
  let minutesOvertime = 0;
  let minutesUndertime = 0;
  let actualWorkMinutes = 0;
  let workMinutesMinusLunch = 0;

  if (timeIn === 0 || timeOut === 0) {
    // No complete record
    if (timeIn > 0 && timeOut === 0) {
      timeStatus = 'Ongoing';
    } else if (timeIn === 0) {
      timeStatus = 'Absent';
    }
    return {
      timeStatus,
      minutesLate,
      minutesEarly,
      minutesOvertime,
      minutesUndertime,
      actualWorkMinutes,
      workMinutesMinusLunch,
      isAbsent: timeIn === 0,
      isHalfDay: false,
      lateTimeIn: null,
      earlyTimeOut: null,
    };
  }

  // Calculate actual work time
  actualWorkMinutes = timeOut - timeIn;

  // Deduct lunch break (1 hour)
  workMinutesMinusLunch = Math.max(0, actualWorkMinutes - LUNCH_BREAK_MINUTES);

  // Detect late arrival
  if (timeIn > workStartTime) {
    minutesLate = timeIn - workStartTime;
  }

  // Detect early departure
  const expectedWorkEnd = workStartTime + DEFAULT_WORK_HOURS * 60;
  if (timeOut < expectedWorkEnd) {
    minutesEarly = expectedWorkEnd - timeOut;
  }

  // Calculate overtime and undertime
  const expectedWorkMinutes = DEFAULT_WORK_HOURS * 60 - LUNCH_BREAK_MINUTES;
  if (workMinutesMinusLunch > expectedWorkMinutes) {
    minutesOvertime = workMinutesMinusLunch - expectedWorkMinutes;
  } else if (workMinutesMinusLunch < expectedWorkMinutes) {
    minutesUndertime = expectedWorkMinutes - workMinutesMinusLunch;
  }

  // Determine status
  if (minutesLate === 0 && minutesEarly === 0) {
    timeStatus = 'On-Time';
  } else if (minutesLate > 0 && minutesEarly === 0) {
    timeStatus = 'Late';
  } else if (minutesLate === 0 && minutesEarly > 0) {
    timeStatus = 'Early Out';
  } else {
    timeStatus = 'Late';
  }

  // Mark as half day if undertime is significant (more than 4 hours)
  const isHalfDay = minutesUndertime > 240; // 4 hours

  return {
    timeStatus,
    minutesLate,
    minutesEarly,
    minutesOvertime,
    minutesUndertime,
    actualWorkMinutes,
    workMinutesMinusLunch,
    isAbsent: false,
    isHalfDay,
    lateTimeIn: minutesLate > 0 ? minutesToTimeString(timeIn) : null,
    earlyTimeOut: minutesEarly > 0 ? minutesToTimeString(timeOut) : null,
  };
};

/**
 * Validate attendance data
 * @param {object} data - Attendance data
 * @returns {array} Validation errors
 */
const validateAttendanceData = (data) => {
  const errors = [];

  if (!safeString(data.employeeId)) {
    errors.push('Employee ID is required');
  }

  if (!safeString(data.date)) {
    errors.push('Date is required');
  } else {
    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      errors.push('Date must be in YYYY-MM-DD format');
    }
  }

  // If both timeIn and timeOut are provided, validate
  if (data.timeIn && data.timeOut) {
    const timeIn = isoToMinutes(data.timeIn);
    const timeOut = isoToMinutes(data.timeOut);
    if (timeOut <= timeIn) {
      errors.push('Time out must be after time in');
    }
  }

  return errors;
};

/**
 * Process attendance record - calculate status, durations, and save to attendanceSummaries
 * @param {object} payload - Contains employeeId, date, timeIn, timeOut, companyId
 * @param {object} options - Contains userId, email, companyId
 * @returns {object} Processed attendance record
 */
const processAttendance = async (payload = {}, options = {}) => {
  try {
    const errors = validateAttendanceData(payload);
    if (errors.length > 0) {
      throw createServiceError('invalid-argument', `Validation errors: ${errors.join(', ')}`, errors);
    }

    const employeeId = safeString(payload.employeeId);
    const date = safeString(payload.date);

    // Get companyId from payload or options (from token)
    let companyId = safeString(payload.companyId) || safeString(options.companyId);
    if (!companyId) {
      throw createServiceError('invalid-argument', 'companyId is required');
    }

    const db = firestore();

    // Get employee schedule for the date
    const schedule = await getEmployeeSchedule(employeeId, date);

    // Get or create time record
    let timeRecord = null;
    let recordId = null;

    // Try to find existing record
    const timeRecordsQuery = db
      .collection(TIME_RECORDS_COLLECTION)
      .where('employeeId', '==', employeeId)
      .where('date', '==', date);

    const timeRecordsSnapshot = await timeRecordsQuery.get();

    if (!timeRecordsSnapshot.empty) {
      recordId = timeRecordsSnapshot.docs[0].id;
      timeRecord = timeRecordsSnapshot.docs[0].data();
    } else {
      // Create new time record object for later upsert
      timeRecord = {
        employeeId,
        date,
        timeIn: payload.timeIn || null,
        timeOut: payload.timeOut || null,
      };
      recordId = null;
    }

    // Update with new data if provided
    if (payload.timeIn) {
      timeRecord.timeIn = payload.timeIn;
    }
    if (payload.timeOut) {
      timeRecord.timeOut = payload.timeOut;
    }

    // Calculate attendance status
    const statusCalculation = calculateTimeStatus(timeRecord, schedule);

    // Prepare attendance summary
    const attendanceSummary = {
      employeeId,
      date,
      timeIn: timeRecord.timeIn || null,
      timeOut: timeRecord.timeOut || null,
      status: statusCalculation.timeStatus,
      timeStatusColor: getStatusColor(statusCalculation.timeStatus),
      minutesLate: statusCalculation.minutesLate,
      minutesEarly: statusCalculation.minutesEarly,
      minutesOvertime: statusCalculation.minutesOvertime,
      minutesUndertime: statusCalculation.minutesUndertime,
      actualWorkMinutes: statusCalculation.actualWorkMinutes,
      workMinutesMinusLunch: statusCalculation.workMinutesMinusLunch,
      isAbsent: statusCalculation.isAbsent,
      isHalfDay: statusCalculation.isHalfDay,
      lateTimeIn: statusCalculation.lateTimeIn,
      earlyTimeOut: statusCalculation.earlyTimeOut,
      workStartTime: schedule.startTime,
      workEndTime: schedule.endTime,
      companyId: companyId,
      processedAt: new Date().toISOString(),
    };

    if (options.userId) {
      attendanceSummary.processedBy = options.userId;
    }

    if (options.email) {
      attendanceSummary.processedByEmail = options.email;
    }

    // Save to attendanceSummaries collection
    const attendanceRef = db
      .collection(ATTENDANCE_SUMMARIES_COLLECTION)
      .doc(`${employeeId}_${date}`);

    await attendanceRef.set(
      {
        ...attendanceSummary,
        id: `${employeeId}_${date}`,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Upsert into timeRecords collection for day view compatibility
    const isNewTimeRecord = !recordId;
    const timeRecordId = recordId || `${employeeId}_${date}`;

    const statusLabel = attendanceSummary.isAbsent
      ? 'Absent'
      : (attendanceSummary.isHalfDay ? 'Half Day' : 'Present');

    await db.collection(TIME_RECORDS_COLLECTION).doc(timeRecordId).set(
      {
        employeeId,
        companyId: companyId,
        date,
        timeIn: timeRecord.timeIn || null,
        timeOut: timeRecord.timeOut || null,
        status: statusLabel,
        notes: payload.notes || timeRecord.notes || '',
        workStartTime: schedule.startTime,
        workEndTime: schedule.endTime,
        timeStatus: attendanceSummary.status,
        timeStatusColor: attendanceSummary.timeStatusColor,
        updatedAt: FieldValue.serverTimestamp(),
        ...(isNewTimeRecord ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true }
    );

    return {
      success: true,
      attendanceId: `${employeeId}_${date}`,
      attendance: {
        ...attendanceSummary,
        updatedAt: new Date().toISOString(),
      },
      message: `Attendance processed successfully for ${date}`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to process attendance: ${error.message}`);
  }
};

/**
 * Get status color based on time status
 * @param {string} status - Time status
 * @returns {string} Color code
 */
const getStatusColor = (status) => {
  const colorMap = {
    'On-Time': '#10b981',      // green
    'Late': '#ef4444',         // red
    'Early Out': '#f59e0b',    // amber
    'Absent': '#6b7280',       // gray
    'Ongoing': '#3b82f6',      // blue
    'No Record': '#9ca3af',    // light gray
  };
  return colorMap[status] || '#9ca3af';
};

/**
 * Generate attendance report with statistics
 * @param {object} payload - Query parameters
 * @param {object} options - Contains userId, email
 * @returns {object} Formatted report data
 */
const generateAttendanceReport = async (payload = {}, options = {}) => {
  try {
    const companyId = safeString(payload.companyId);
    const startDate = safeString(payload.startDate);
    const endDate = safeString(payload.endDate);
    const employeeId = safeString(payload.employeeId);
    const department = safeString(payload.department);

    console.log('🔍 generateAttendanceReport called with payload:', {
      companyId,
      startDate,
      endDate,
      employeeId,
      department
    });

    if (!companyId) {
      throw createServiceError('invalid-argument', 'companyId is required');
    }

    if (!startDate || !endDate) {
      throw createServiceError('invalid-argument', 'startDate and endDate are required');
    }

    const db = firestore();

    console.log(`📊 Querying ${ATTENDANCE_SUMMARIES_COLLECTION} collection with:`, {
      companyId,
      dateRange: `${startDate} to ${endDate}`,
      employeeId: employeeId || 'ALL'
    });

    // Build query (filter by company and date range)
    let query = db.collection(ATTENDANCE_SUMMARIES_COLLECTION)
      .where('companyId', '==', companyId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate);

    // Add filters
    if (employeeId) {
      query = query.where('employeeId', '==', employeeId);
    }

    const snapshot = await query.get();

    console.log(`✅ Query returned ${snapshot.size} documents from ${ATTENDANCE_SUMMARIES_COLLECTION}`);

    // Process results
    const attendanceRecords = [];
    const statistics = {
      totalDays: 0,
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
      averageMinutesLate: 0,
      averageMinutesEarly: 0,
      averageMinutesOvertime: 0,
      averageMinutesUndertime: 0,
    };

    snapshot.forEach((doc) => {
      const record = { id: doc.id, ...doc.data() };
      attendanceRecords.push(record);

      // Update statistics
      statistics.totalDays += 1;

      if (record.isAbsent) {
        statistics.absentDays += 1;
      } else {
        statistics.presentDays += 1;
      }

      if (record.isHalfDay) {
        statistics.halfDays += 1;
      }

      if (record.minutesLate > 0) {
        statistics.lateDays += 1;
        statistics.totalMinutesLate += record.minutesLate;
      }

      if (record.minutesEarly > 0) {
        statistics.earlyOutDays += 1;
        statistics.totalMinutesEarly += record.minutesEarly;
      }

      if (record.minutesOvertime > 0) {
        statistics.overtimeDays += 1;
        statistics.totalMinutesOvertime += record.minutesOvertime;
      }

      if (record.minutesUndertime > 0) {
        statistics.totalMinutesUndertime += record.minutesUndertime;
      }
    });

    // Calculate averages
    if (statistics.lateDays > 0) {
      statistics.averageMinutesLate = Math.round(statistics.totalMinutesLate / statistics.lateDays);
    }

    if (statistics.earlyOutDays > 0) {
      statistics.averageMinutesEarly = Math.round(statistics.totalMinutesEarly / statistics.earlyOutDays);
    }

    if (statistics.overtimeDays > 0) {
      statistics.averageMinutesOvertime = Math.round(statistics.totalMinutesOvertime / statistics.overtimeDays);
    }

    if (statistics.presentDays > 0) {
      statistics.averageMinutesUndertime = Math.round(statistics.totalMinutesUndertime / statistics.presentDays);
    }

    return {
      success: true,
      reportData: {
        period: {
          startDate,
          endDate,
          employeeId: employeeId || 'all',
          department: department || 'all',
        },
        statistics,
        records: attendanceRecords,
        generatedAt: new Date().toISOString(),
      },
      message: `Attendance report generated for ${attendanceRecords.length} records`,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to generate attendance report: ${error.message}`);
  }
};

/**
 * List time records by filters
 * @param {object} payload - { companyId, date?, startDate?, endDate?, employeeId? }
 */
const listTimeRecords = async (payload = {}) => {
  const companyId = safeString(payload.companyId);
  const { date, startDate, endDate, employeeId } = payload;
  if (!companyId) {
    throw createServiceError('invalid-argument', 'companyId is required');
  }

  const db = firestore();
  let q = db.collection(TIME_RECORDS_COLLECTION).where('companyId', '==', companyId);

  if (safeString(employeeId)) {
    q = q.where('employeeId', '==', safeString(employeeId));
  }

  if (safeString(date)) {
    q = q.where('date', '==', safeString(date));
  } else {
    if (!safeString(startDate) || !safeString(endDate)) {
      throw createServiceError('invalid-argument', 'Either date or startDate and endDate are required');
    }
    q = q.where('date', '>=', safeString(startDate)).where('date', '<=', safeString(endDate));
  }

  const snapshot = await q.get();
  const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { success: true, records };
};

/**
 * Delete a time record by id or (employeeId,date)
 */
const deleteTimeRecord = async (payload = {}) => {
  const db = firestore();
  const { recordId } = payload;
  let { employeeId, date, companyId } = payload;

  let toDeleteId = safeString(recordId);

  if (!toDeleteId) {
    employeeId = safeString(employeeId);
    date = safeString(date);
    if (!employeeId || !date) {
      throw createServiceError('invalid-argument', 'recordId or (employeeId and date) are required');
    }
    // Find a record by employeeId + date (+ optional company)
    let q = db.collection(TIME_RECORDS_COLLECTION)
      .where('employeeId', '==', employeeId)
      .where('date', '==', date);
    if (safeString(companyId)) {
      q = q.where('companyId', '==', safeString(companyId));
    }
    const snap = await q.limit(1).get();
    if (snap.empty) {
      throw createServiceError('not-found', 'Time record not found');
    }
    toDeleteId = snap.docs[0].id;
  }

  await db.collection(TIME_RECORDS_COLLECTION).doc(toDeleteId).delete();

  // Best effort: remove daily summary as well
  if (safeString(employeeId) && safeString(date)) {
    await db.collection(ATTENDANCE_SUMMARIES_COLLECTION).doc(`${employeeId}_${date}`).delete().catch(() => {});
  }

  return { success: true, deleted: 1 };
};

module.exports.listTimeRecords = listTimeRecords;
module.exports.deleteTimeRecord = deleteTimeRecord;

// ================================
// Employee Schedules
// ================================

const listSchedules = async (payload = {}) => {
  const db = firestore();
  const companyId = safeString(payload.companyId);
  const employeeId = safeString(payload.employeeId);
  if (!companyId) {
    throw createServiceError('invalid-argument', 'companyId is required');
  }
  let q = db.collection(EMPLOYEE_SCHEDULES_COLLECTION).where('companyId', '==', companyId);
  if (employeeId) {
    q = q.where('employeeId', '==', employeeId);
  }
  const snapshot = await q.get();
  const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { success: true, schedules: records };
};

const saveSchedule = async (payload = {}, options = {}) => {
  const db = firestore();
  const companyId = safeString(payload.companyId);
  const employeeId = safeString(payload.employeeId);
  const startTime = safeString(payload.startTime) || '09:00';
  const endTime = safeString(payload.endTime) || '17:00';
  const effectiveDate = safeString(payload.effectiveDate) || new Date().toISOString().slice(0, 10);
  const scheduleId = safeString(payload.scheduleId);

  if (!companyId || !employeeId) {
    throw createServiceError('invalid-argument', 'companyId and employeeId are required');
  }

  const data = {
    companyId,
    employeeId,
    startTime,
    endTime,
    effectiveDate,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (options.userId) data.updatedBy = options.userId;
  if (options.email) data.updatedByEmail = options.email;

  if (scheduleId) {
    await db.collection(EMPLOYEE_SCHEDULES_COLLECTION).doc(scheduleId).set(data, { merge: true });
    return { success: true, scheduleId };
  }

  const ref = await db.collection(EMPLOYEE_SCHEDULES_COLLECTION).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { success: true, scheduleId: ref.id };
};

const deleteSchedule = async (payload = {}) => {
  const db = firestore();
  const scheduleId = safeString(payload.scheduleId);
  if (!scheduleId) {
    throw createServiceError('invalid-argument', 'scheduleId is required');
  }
  await db.collection(EMPLOYEE_SCHEDULES_COLLECTION).doc(scheduleId).delete();
  return { success: true, deleted: 1 };
};

module.exports.listSchedules = listSchedules;
module.exports.saveSchedule = saveSchedule;
module.exports.deleteSchedule = deleteSchedule;

/**
 * Bulk process attendance for multiple employees
 * @param {array} attendanceRecords - Array of attendance data
 * @param {object} options - Contains userId, email
 * @returns {object} Bulk processing results
 */
const bulkProcessAttendance = async (attendanceRecords = [], options = {}) => {
  if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
    throw createServiceError('invalid-argument', 'At least one attendance record is required');
  }

  try {
    const results = [];
    const errors = [];

    for (const record of attendanceRecords) {
      try {
        const result = await processAttendance(record, options);
        results.push(result);
      } catch (error) {
        errors.push({
          employeeId: record.employeeId,
          date: record.date,
          error: error.message || 'Unknown error',
        });
      }
    }

    return {
      success: errors.length === 0,
      totalProcessed: attendanceRecords.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    };
  } catch (error) {
    throw createServiceError('internal', `Failed to bulk process attendance: ${error.message}`);
  }
};

module.exports = {
  processAttendance,
  generateAttendanceReport,
  bulkProcessAttendance,
  calculateTimeStatus,
  getEmployeeSchedule,
  validateAttendanceData,
  timeStringToMinutes,
  minutesToTimeString,
  isoToMinutes,
  listSchedules,
  saveSchedule,
  deleteSchedule,
  listTimeRecords,
  deleteTimeRecord,
};
