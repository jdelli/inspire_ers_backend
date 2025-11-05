const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const multer = require('multer');
const XLSX = require('xlsx');
const { recordActivity } = require('../services/activityLogService');

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();

const db = admin.firestore();
const router = express.Router();

const logActivitySafe = async (payload = {}) => {
  try {
    await recordActivity(payload);
  } catch (error) {
    console.error('Failed to record attendance activity log:', error);
  }
};

const buildActivityContext = (req) => ({
  user: req.user || null,
  request: req.activityContext || {},
});

// ============================================================================
// ATTENDANCE RECORDS CRUD ENDPOINTS
// ============================================================================

// Process single attendance record
router.post('/process', async (req, res) => {
  try {
    const { employeeId, date, timeIn, timeOut, companyId, status = 'Present', notes = '' } = req.body;
    
    console.log('🔍 Processing attendance record:', { employeeId, date, timeIn, timeOut, companyId });

    if (!employeeId || !date || !companyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: employeeId, date, companyId'
      });
    }

    // Get employee info
    const employeeDoc = await db.collection('employees').doc(employeeId).get();
    if (!employeeDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found'
      });
    }

    const employeeData = employeeDoc.data();
    const employeeName = `${employeeData.firstName} ${employeeData.lastName}`;

    // Calculate time status
    const timeStatus = calculateTimeStatus(timeIn, timeOut, employeeId);

    // Create attendance record
    const attendanceRecord = {
      employeeId,
      employeeName,
      companyId,
      date,
      timeIn: timeIn || null,
      timeOut: timeOut || null,
      status,
      notes,
      timeStatus: timeStatus.status,
      timeStatusColor: timeStatus.color,
      totalMinutesLate: timeStatus.totalMinutesLate || 0,
      totalEarlyMinutes: timeStatus.totalEarlyMinutes || 0,
      totalOvertimeMinutes: timeStatus.totalOvertimeMinutes || 0,
      totalUndertimeMinutes: timeStatus.totalUndertimeMinutes || 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Check if record already exists for this employee and date
    const existingQuery = db.collection('timeRecords')
      .where('employeeId', '==', employeeId)
      .where('date', '==', date)
      .where('companyId', '==', companyId);

    const existingRecords = await existingQuery.get();
    const existedBefore = existingRecords.docs.length > 0;

    let recordId;
    if (existedBefore) {
      // Update existing record
      recordId = existingRecords.docs[0].id;
      await db.collection('timeRecords').doc(recordId).update(attendanceRecord);
      console.log(`✅ Updated existing attendance record: ${recordId}`);
    } else {
      // Create new record
      const docRef = await db.collection('timeRecords').add(attendanceRecord);
      recordId = docRef.id;
      console.log(`✅ Created new attendance record: ${recordId}`);
    }

    await logActivitySafe({
      module: 'hr',
      action: existedBefore ? 'ATTENDANCE_RECORD_UPDATED' : 'ATTENDANCE_RECORD_CREATED',
      companyId,
      entityType: 'employee',
      entityId: employeeId,
      summary: `${existedBefore ? 'Updated' : 'Created'} attendance record for employee ${employeeId} on ${date}`,
      metadata: {
        recordId,
        status,
        date,
        timeIn: timeIn || null,
        timeOut: timeOut || null,
        totalMinutesLate: attendanceRecord.totalMinutesLate,
        totalUndertimeMinutes: attendanceRecord.totalUndertimeMinutes,
      },
      context: buildActivityContext(req),
    });

    await logActivitySafe({
      module: 'hr',
      action: 'ATTENDANCE_SUMMARY_GENERATED',
      companyId,
      entityType: 'company',
      entityId: companyId,
      summary: `Generated attendance summary for ${dateRange}`,
      metadata: {
        employeeId: employeeId || 'ALL',
        department: department || null,
        summaries: summaries.length,
        records: records.length,
        source: 'calculated',
      },
      context: buildActivityContext(req),
    });

    await logActivitySafe({
      module: 'hr',
      action: 'ATTENDANCE_SUMMARY_GENERATED',
      companyId,
      entityType: 'company',
      entityId: companyId,
      summary: `Generated attendance summary for ${dateRange}`,
      metadata: {
        employeeId: employeeId || 'ALL',
        department: department || null,
        summaries: summaries.length,
        records: records.length,
        source: 'calculated',
      },
      context: buildActivityContext(req),
    });

    res.json({
      success: true,
      recordId,
      message: 'Attendance record processed successfully'
    });

  } catch (error) {
    console.error('❌ Error processing attendance record:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

async function processBulkAttendance(attendanceRecords) {
  const batch = db.batch();
  let successCount = 0;
  const errors = [];

  for (const recordData of attendanceRecords) {
    const { employeeId, date, timeIn, timeOut, companyId, status = 'Present', notes = '' } = recordData;

    if (!employeeId || !date || !companyId) {
      errors.push({
        employeeId,
        date,
        error: 'Missing required parameters'
      });
      continue;
    }

    try {
      const employeeDoc = await db.collection('employees').doc(employeeId).get();
      if (!employeeDoc.exists) {
        errors.push({
          employeeId,
          date,
          error: 'Employee not found'
        });
        continue;
      }

      const employeeData = employeeDoc.data();
      const employeeName = `${employeeData.firstName} ${employeeData.lastName}`;

      const timeStatus = calculateTimeStatus(timeIn, timeOut, employeeId);

      const attendanceRecord = {
        employeeId,
        employeeName,
        companyId,
        date,
        timeIn: timeIn || null,
        timeOut: timeOut || null,
        status,
        notes,
        timeStatus: timeStatus.status,
        timeStatusColor: timeStatus.color,
        totalMinutesLate: timeStatus.totalMinutesLate || 0,
        totalEarlyMinutes: timeStatus.totalEarlyMinutes || 0,
        totalOvertimeMinutes: timeStatus.totalOvertimeMinutes || 0,
        totalUndertimeMinutes: timeStatus.totalUndertimeMinutes || 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const existingRecordQuery = db.collection('timeRecords')
        .where('employeeId', '==', employeeId)
        .where('date', '==', date)
        .where('companyId', '==', companyId);
      
      const existingRecordSnapshot = await existingRecordQuery.get();

      if (!existingRecordSnapshot.empty) {
        const existingDoc = existingRecordSnapshot.docs[0];
        batch.update(existingDoc.ref, attendanceRecord);
      } else {
        attendanceRecord.createdAt = admin.firestore.FieldValue.serverTimestamp();
        const newDocRef = db.collection('timeRecords').doc();
        batch.set(newDocRef, attendanceRecord);
      }

      successCount++;

    } catch (error) {
      errors.push({
        employeeId,
        date,
        error: error.message
      });
    }
  }

  await batch.commit();

  return { successCount, errors };
}

// Bulk process attendance records
router.post('/bulk-process', async (req, res) => {
  try {
    const { attendanceRecords } = req.body;
    
    console.log(`🔍 Bulk processing ${attendanceRecords.length} attendance records`);

    if (!attendanceRecords || !Array.isArray(attendanceRecords)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid attendanceRecords array'
      });
    }

    const bulkCompanyId = attendanceRecords.length > 0 ? (attendanceRecords[0].companyId || null) : null;

    const { successCount, errors } = await processBulkAttendance(attendanceRecords);

    await logActivitySafe({
      module: 'hr',
      action: 'ATTENDANCE_BULK_PROCESSED',
      companyId: bulkCompanyId,
      entityType: 'bulk',
      entityId: null,
      summary: `Processed ${successCount}/${attendanceRecords.length} attendance records`,
      metadata: {
        total: attendanceRecords.length,
        success: successCount,
        failures: errors.length,
      },
      context: buildActivityContext(req),
    });

    res.json({
      success: true,
      summary: {
        total: attendanceRecords.length,
        success: successCount,
        failures: errors.length
      },
      message: `Processed ${successCount}/${attendanceRecords.length} records successfully`,
      errors: errors
    });

  } catch (error) {
    console.error('❌ Error bulk processing attendance records:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List raw time records
router.get('/records', async (req, res) => {
  try {
    const { companyId, employeeId, startDate, endDate, date } = req.query;
    
    console.log('🔍 Listing attendance records:', { companyId, employeeId, startDate, endDate, date });

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: companyId'
      });
    }

    // Query both collections for compatibility
    const timeRecordsQuery = db.collection('timeRecords').where('companyId', '==', companyId);
    const attendanceQuery = db.collection('attendance').where('companyId', '==', companyId);

    // Apply filters
    let timeQuery = timeRecordsQuery;
    let attQuery = attendanceQuery;

    if (employeeId) {
      timeQuery = timeQuery.where('employeeId', '==', employeeId);
      attQuery = attQuery.where('employeeId', '==', employeeId);
    }

    if (date) {
      timeQuery = timeQuery.where('date', '==', date);
      attQuery = attQuery.where('date', '==', date);
    }

    // Fetch from both collections
    const [timeSnapshot, attSnapshot] = await Promise.all([
      timeQuery.get(),
      attQuery.get()
    ]);

    console.log(`📊 Found ${timeSnapshot.docs.length} records in timeRecords, ${attSnapshot.docs.length} in attendance`);

    const timeRecords = timeSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      _source: 'timeRecords'
    }));

    const attRecords = attSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      _source: 'attendance'
    }));

    // Combine records from both collections
    const records = [...timeRecords, ...attRecords];

    // Filter by date range if specified
    let filteredRecords = records;
    if (startDate && endDate) {
      filteredRecords = records.filter(record => {
        const recordDate = record.date;
        return recordDate >= startDate && recordDate <= endDate;
      });
      console.log(`📊 Filtered to ${filteredRecords.length} records in date range`);
    }

    res.json({
      success: true,
      records: filteredRecords,
      total: filteredRecords.length
    });

  } catch (error) {
    console.error('❌ Error listing attendance records:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete attendance record
router.post('/delete', async (req, res) => {
  try {
    const { recordId, employeeId, date, companyId } = req.body;

    console.log('?? Deleting attendance record:', { recordId, employeeId, date, companyId });

    let deletedCount = 0;
    let deletionSummary = '';
    const deletionMetadata = {
      mode: recordId ? 'byId' : 'byCriteria',
      recordId: recordId || null,
      employeeId: employeeId || null,
      date: date || null,
      companyId: companyId || null,
    };

    if (recordId) {
      await db.collection('timeRecords').doc(recordId).delete();
      console.log('? Deleted record: ' + recordId);
      deletedCount = 1;
      deletionSummary = 'Deleted attendance record ' + recordId;
    } else if (employeeId && date && companyId) {
      const query = db.collection('timeRecords')
        .where('employeeId', '==', employeeId)
        .where('date', '==', date)
        .where('companyId', '==', companyId);

      const snapshot = await query.get();

      if (snapshot.empty) {
        return res.status(404).json({
          success: false,
          error: 'Record not found',
        });
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      deletedCount = snapshot.docs.length;
      deletionSummary =
        'Deleted ' + snapshot.docs.length + ' attendance record(s) for employee ' + employeeId + ' on ' + date;
      deletionMetadata.deletedRecords = snapshot.docs.map((doc) => doc.id);
      console.log('? Deleted ' + snapshot.docs.length + ' record(s) for employee ' + employeeId + ' on ' + date);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: either recordId or (employeeId, date, companyId)',
      });
    }

    deletionMetadata.deletedCount = deletedCount;

    await logActivitySafe({
      module: 'hr',
      action: 'ATTENDANCE_RECORD_DELETED',
      companyId: companyId || null,
      entityType: recordId ? 'attendanceRecord' : 'employee',
      entityId: recordId || employeeId || null,
      summary: deletionSummary || 'Deleted attendance record',
      metadata: deletionMetadata,
      context: buildActivityContext(req),
    });

    res.json({
      success: true,
      message: 'Attendance record deleted successfully',
    });
  } catch (error) {
    console.error('? Error deleting attendance record:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Calculate time status
router.post('/calculate-time-status', async (req, res) => {
  try {
    const { timeIn, timeOut, startTime, endTime, employeeId } = req.body;
    
    console.log('🔍 Calculating time status:', { timeIn, timeOut, startTime, endTime, employeeId });

    const timeStatus = calculateTimeStatus(timeIn, timeOut, employeeId, null, { startTime, endTime });

    res.json({
      success: true,
      timeStatus
    });

  } catch (error) {
    console.error('❌ Error calculating time status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SCHEDULE MANAGEMENT ENDPOINTS
// ============================================================================

// List schedules
router.get('/schedules', async (req, res) => {
  try {
    const { companyId, employeeId } = req.query;
    
    console.log('🔍 Listing schedules:', { companyId, employeeId });

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: companyId'
      });
    }

    let query = db.collection('employeeSchedules').where('companyId', '==', companyId);

    if (employeeId) {
      query = query.where('employeeId', '==', employeeId);
    }

    const snapshot = await query.get();
    console.log(`📊 Found ${snapshot.docs.length} schedules`);

    const schedules = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      schedules,
      total: schedules.length
    });

  } catch (error) {
    console.error('❌ Error listing schedules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save schedule
router.post('/schedules', async (req, res) => {
  try {
    const { employeeId, employeeName, companyId, startTime, endTime, effectiveDate } = req.body;
    
    console.log('🔍 Saving schedule:', { employeeId, employeeName, companyId, startTime, endTime, effectiveDate });

    if (!employeeId || !companyId || !startTime || !endTime || !effectiveDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: employeeId, companyId, startTime, endTime, effectiveDate'
      });
    }

    const scheduleData = {
      employeeId,
      employeeName,
      companyId,
      startTime,
      endTime,
      effectiveDate,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('employeeSchedules').add(scheduleData);
    console.log(`✅ Created schedule: ${docRef.id}`);

    res.json({
      success: true,
      scheduleId: docRef.id,
      message: 'Schedule saved successfully'
    });

  } catch (error) {
    console.error('❌ Error saving schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete schedule
router.post('/schedules/delete', async (req, res) => {
  try {
    const { scheduleId, employeeId, companyId } = req.body;
    
    console.log('🔍 Deleting schedule:', { scheduleId, employeeId, companyId });

    if (scheduleId) {
      // Delete by schedule ID
      await db.collection('employeeSchedules').doc(scheduleId).delete();
      console.log(`✅ Deleted schedule: ${scheduleId}`);
    } else if (employeeId && companyId) {
      // Delete all schedules for employee
      const query = db.collection('employeeSchedules')
        .where('employeeId', '==', employeeId)
        .where('companyId', '==', companyId);

      const snapshot = await query.get();
      
      if (snapshot.docs.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No schedules found'
        });
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      console.log(`✅ Deleted ${snapshot.docs.length} schedule(s) for employee ${employeeId}`);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: either scheduleId or (employeeId, companyId)'
      });
    }

    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Calculate time status for attendance records
function calculateTimeStatus(timeIn, timeOut, employeeId, attendanceStatus = null, recordSchedule = null) {
  // This is a simplified version - you can expand this based on your business logic
  if (!timeIn) {
    return {
      status: 'No Time In',
      color: 'red',
      totalMinutesLate: 0,
      totalEarlyMinutes: 0,
      totalOvertimeMinutes: 0,
      totalUndertimeMinutes: 0
    };
  }

  if (!timeOut) {
    return {
      status: 'No Time Out',
      color: 'orange',
      totalMinutesLate: 0,
      totalEarlyMinutes: 0,
      totalOvertimeMinutes: 0,
      totalUndertimeMinutes: 0
    };
  }

  // Default schedule if not provided
  const schedule = recordSchedule || { startTime: '09:00', endTime: '17:00' };
  
  const startTime = schedule.startTime || '09:00';
  const endTime = schedule.endTime || '17:00';

  // Convert times to minutes for easier calculation
  const timeInMinutes = convertTimeToMinutes(timeIn);
  const timeOutMinutes = convertTimeToMinutes(timeOut);
  const startTimeMinutes = convertTimeToMinutes(startTime);
  const endTimeMinutes = convertTimeToMinutes(endTime);

  let status = 'Present';
  let color = 'green';
  let totalMinutesLate = 0;
  let totalEarlyMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalUndertimeMinutes = 0;

  // Check if late
  if (timeInMinutes > startTimeMinutes) {
    totalMinutesLate = timeInMinutes - startTimeMinutes;
    status = 'Late';
    color = 'orange';
  }

  // Check if early departure
  if (timeOutMinutes < endTimeMinutes) {
    totalEarlyMinutes = endTimeMinutes - timeOutMinutes;
    if (status === 'Late') {
      status = 'Late & Early';
    } else {
      status = 'Early';
    }
    color = 'orange';
  }

  // Check for overtime
  if (timeOutMinutes > endTimeMinutes) {
    totalOvertimeMinutes = timeOutMinutes - endTimeMinutes;
    if (status === 'Late') {
      status = 'Late & Overtime';
    } else if (status === 'Early') {
      status = 'Early & Overtime';
    } else {
      status = 'Overtime';
    }
    color = 'purple';
  }

  return {
    status,
    color,
    totalMinutesLate,
    totalEarlyMinutes,
    totalOvertimeMinutes,
    totalUndertimeMinutes
  };
}

// Convert time string to minutes
function convertTimeToMinutes(timeString) {
  if (!timeString) return 0;
  
  // Handle ISO format (e.g., "2025-08-13T09:30:00")
  if (timeString.includes('T')) {
    const timePart = timeString.split('T')[1];
    const [hours, minutes] = timePart.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  // Handle simple format (e.g., "09:30")
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

// Generate attendance report/summary from raw timeRecords data

// Generate attendance report/summary from raw timeRecords data
router.post('/report', async (req, res) => {
  try {
    const { companyId, startDate, endDate, employeeId, department } = req.body;
    
    console.log('🔍 generateAttendanceReport called with payload:', {
      companyId,
      startDate,
      endDate,
      employeeId,
      department
    });

    // Validate required parameters
    if (!companyId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, startDate, endDate'
      });
    }

    // First, check if summary already exists in attendanceSummaries collection
    const dateRange = `${startDate} to ${endDate}`;
    console.log('📊 Querying attendanceSummaries collection with:', {
      companyId,
      dateRange,
      employeeId
    });

    let summaryQuery = db.collection('attendanceSummaries')
      .where('companyId', '==', companyId)
      .where('dateRange', '==', dateRange);

    if (employeeId && employeeId !== 'ALL' && employeeId !== '') {
      summaryQuery = summaryQuery.where('employeeId', '==', employeeId);
    }

    const existingSummaries = await summaryQuery.get();
    console.log(`✅ Query returned ${existingSummaries.docs.length} documents from attendanceSummaries`);

    if (existingSummaries.docs.length > 0) {
      // Return existing summaries
      const summaries = existingSummaries.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      await logActivitySafe({
        module: 'hr',
        action: 'ATTENDANCE_SUMMARY_ACCESSED',
        companyId,
        entityType: 'company',
        entityId: companyId,
        summary: `Downloaded existing attendance summary for ${dateRange}`,
        metadata: {
          records: summaries.length,
          employeeId: employeeId || 'ALL',
          department: department || null,
          source: 'existing',
        },
        context: buildActivityContext(req),
      });

      return res.json({
        success: true,
        summaries,
        source: 'existing'
      });
    }

    // No existing summaries found, generate from raw timeRecords data
    console.log('🔄 No existing summaries found, generating from raw timeRecords data...');

    // Query raw timeRecords data - use simpler query to avoid index issues
    let timeRecordsQuery = db.collection('timeRecords')
      .where('companyId', '==', companyId);

    const timeRecordsSnapshot = await timeRecordsQuery.get();
    console.log(`📊 Found ${timeRecordsSnapshot.docs.length} total timeRecords for company`);

    // Filter by date range and employee in JavaScript to avoid index issues
    const allRecords = timeRecordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`📊 Sample records for debugging:`, allRecords.slice(0, 3));

    // Parse start and end dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filteredRecords = allRecords.filter(record => {
      const recordDate = record.date;
      if (!recordDate) return false;

      // Parse the record date - handle multiple formats
      let recordDateObj;
      if (recordDate.includes('/')) {
        // Handle MM/DD/YYYY or DD/MM/YYYY format
        const parts = recordDate.split('/');
        if (parts.length === 3) {
          // Assume MM/DD/YYYY format
          const [month, day, year] = parts;
          recordDateObj = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        }
      } else if (recordDate.includes('-')) {
        // Handle YYYY-MM-DD format
        recordDateObj = new Date(recordDate);
      } else {
        return false;
      }

      const isInDateRange = recordDateObj >= startDateObj && recordDateObj <= endDateObj;
      const isCorrectEmployee = !employeeId || employeeId === 'ALL' || employeeId === '' || record.employeeId === employeeId;

      if (isInDateRange && isCorrectEmployee) {
        console.log(`✓ Record ${record.id} for ${record.employeeId} - Date: ${recordDate} is IN RANGE`);
      }

      return isInDateRange && isCorrectEmployee;
    });

    console.log(`📊 Filtered to ${filteredRecords.length} records matching criteria`);

    // Fetch holidays in range for overlay
    let holidaysInRange = [];
    try {
      const holidaysSnap = await db
        .collection('companyHolidays')
        .where('companyId', '==', companyId)
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get();
      holidaysInRange = holidaysSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`🎉 Found ${holidaysInRange.length} holidays in range`);
    } catch (e) {
      console.warn('⚠️ Failed to fetch holidays for overlay:', e?.message || e);
    }

    if (filteredRecords.length === 0) {
      await logActivitySafe({
        module: 'hr',
        action: 'ATTENDANCE_SUMMARY_GENERATED',
        companyId,
        entityType: 'company',
        entityId: companyId,
        summary: `No attendance records found for ${dateRange}`,
        metadata: {
          employeeId: employeeId || 'ALL',
          department: department || null,
          summaries: 0,
          records: 0,
          source: 'calculated',
        },
        context: buildActivityContext(req),
      });

      return res.json({
        success: true,
        summaries: [],
        message: 'No attendance records found for the specified date range',
        source: 'calculated'
      });
    }

    // Group records by employee
    const employeeRecords = {};
    filteredRecords.forEach(record => {
      const empId = record.employeeId;
      
      if (!employeeRecords[empId]) {
        employeeRecords[empId] = [];
      }
      employeeRecords[empId].push(record);
    });

    // Calculate summaries for each employee
    const summaries = [];
    const batch = db.batch();

    for (const [empId, records] of Object.entries(employeeRecords)) {
      const summary = calculateEmployeeSummary(empId, records, startDate, endDate, companyId);

      // Overlay holidays: add holidayDays for all, presentDays for payable
      const holidayCount = holidaysInRange.length;
      const payableCount = holidaysInRange.filter((h) => h.payable === true).length;
      summary.holidayDays = (summary.holidayDays || 0) + holidayCount;
      summary.presentDays = (summary.presentDays || 0) + payableCount;

      // Attach applied holidays for audit/exports if needed
      summary.appliedHolidays = holidaysInRange.map((h) => ({ date: h.date, name: h.name, payable: !!h.payable }));

      summaries.push(summary);

      // Save summary to attendanceSummaries collection
      const summaryRef = db.collection('attendanceSummaries').doc();
      batch.set(summaryRef, summary);
    }

    // Commit all summaries to database
    await batch.commit();
    console.log(`✅ Generated and saved ${summaries.length} attendance summaries`);

    // Convert summaries to records format for frontend compatibility
    const records = filteredRecords.map(record => ({
      ...record,
      isAbsent: record.status === 'Absent',
      isHalfDay: record.isHalfDay || (record.timeStatus && record.timeStatus.includes('Half Day')),
      minutesLate: record.totalMinutesLate || record.minutesLate || 0,
      minutesEarly: record.totalEarlyMinutes || record.minutesEarly || 0,
      minutesOvertime: record.totalOvertimeMinutes || record.minutesOvertime || 0,
      minutesUndertime: record.totalUndertimeMinutes || record.minutesUndertime || 0
    }));

    res.json({
      success: true,
      reportData: {
        records,
        summaries
      },
      source: 'calculated',
      message: `Generated ${summaries.length} attendance summaries from ${records.length} raw records`
    });

  } catch (error) {
    console.error('❌ Error generating attendance report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate attendance report/summary from raw timeRecords data
router.post('/generateAttendanceReport', async (req, res) => {
  try {
    const { companyId, startDate, endDate, employeeId, department } = req.body;
    
    console.log('🔍 generateAttendanceReport called with payload:', {
      companyId,
      startDate,
      endDate,
      employeeId,
      department
    });

    // Validate required parameters
    if (!companyId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, startDate, endDate'
      });
    }

    // First, check if summary already exists in attendanceSummaries collection
    const dateRange = `${startDate} to ${endDate}`;
    console.log('📊 Querying attendanceSummaries collection with:', {
      companyId,
      dateRange,
      employeeId
    });

    let summaryQuery = db.collection('attendanceSummaries')
      .where('companyId', '==', companyId)
      .where('dateRange', '==', dateRange);

    if (employeeId && employeeId !== 'ALL' && employeeId !== '') {
      summaryQuery = summaryQuery.where('employeeId', '==', employeeId);
    }

    const existingSummaries = await summaryQuery.get();
    console.log(`✅ Query returned ${existingSummaries.docs.length} documents from attendanceSummaries`);

    if (existingSummaries.docs.length > 0) {
      // Return existing summaries
      const summaries = existingSummaries.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      await logActivitySafe({
        module: 'hr',
        action: 'ATTENDANCE_SUMMARY_ACCESSED',
        companyId,
        entityType: 'company',
        entityId: companyId,
        summary: `Downloaded existing attendance summary for ${dateRange}`,
        metadata: {
          records: summaries.length,
          employeeId: employeeId || 'ALL',
          department: department || null,
          source: 'existing',
        },
        context: buildActivityContext(req),
      });

      return res.json({
        success: true,
        summaries,
        source: 'existing'
      });
    }

    // No existing summaries found, generate from raw timeRecords data
    console.log('🔄 No existing summaries found, generating from raw timeRecords data...');

    // Query raw timeRecords data - use simpler query to avoid index issues
    let timeRecordsQuery = db.collection('timeRecords')
      .where('companyId', '==', companyId);

    const timeRecordsSnapshot = await timeRecordsQuery.get();
    console.log(`📊 Found ${timeRecordsSnapshot.docs.length} total timeRecords for company`);

    // Filter by date range and employee in JavaScript to avoid index issues
    const allRecords = timeRecordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`📊 Sample records for debugging:`, allRecords.slice(0, 3));

    // Parse start and end dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    const filteredRecords = allRecords.filter(record => {
      const recordDate = record.date;
      if (!recordDate) return false;

      // Parse the record date - handle multiple formats
      let recordDateObj;
      if (recordDate.includes('/')) {
        // Handle MM/DD/YYYY or DD/MM/YYYY format
        const parts = recordDate.split('/');
        if (parts.length === 3) {
          // Assume MM/DD/YYYY format
          const [month, day, year] = parts;
          recordDateObj = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        }
      } else if (recordDate.includes('-')) {
        // Handle YYYY-MM-DD format
        recordDateObj = new Date(recordDate);
      } else {
        return false;
      }

      const isInDateRange = recordDateObj >= startDateObj && recordDateObj <= endDateObj;
      const isCorrectEmployee = !employeeId || employeeId === 'ALL' || employeeId === '' || record.employeeId === employeeId;

      if (isInDateRange && isCorrectEmployee) {
        console.log(`✓ Record ${record.id} for ${record.employeeId} - Date: ${recordDate} is IN RANGE`);
      }

      return isInDateRange && isCorrectEmployee;
    });

    console.log(`📊 Filtered to ${filteredRecords.length} records matching criteria`);

    if (filteredRecords.length === 0) {
      await logActivitySafe({
        module: 'hr',
        action: 'ATTENDANCE_SUMMARY_GENERATED',
        companyId,
        entityType: 'company',
        entityId: companyId,
        summary: `No attendance records found for ${dateRange}`,
        metadata: {
          employeeId: employeeId || 'ALL',
          department: department || null,
          summaries: 0,
          records: 0,
          source: 'calculated',
        },
        context: buildActivityContext(req),
      });

      return res.json({
        success: true,
        summaries: [],
        message: 'No attendance records found for the specified date range',
        source: 'calculated'
      });
    }

    // Group records by employee
    const employeeRecords = {};
    filteredRecords.forEach(record => {
      const empId = record.employeeId;
      
      if (!employeeRecords[empId]) {
        employeeRecords[empId] = [];
      }
      employeeRecords[empId].push(record);
    });

    // Calculate summaries for each employee
    const summaries = [];
    const batch = db.batch();

    for (const [empId, records] of Object.entries(employeeRecords)) {
      const summary = calculateEmployeeSummary(empId, records, startDate, endDate, companyId);

      // Overlay holidays: add holidayDays for all, presentDays for payable
      const holidayCount = holidaysInRange.length;
      const payableCount = holidaysInRange.filter((h) => h.payable === true).length;
      summary.holidayDays = (summary.holidayDays || 0) + holidayCount;
      summary.presentDays = (summary.presentDays || 0) + payableCount;

      // Attach applied holidays for audit/exports if needed
      summary.appliedHolidays = holidaysInRange.map((h) => ({ date: h.date, name: h.name, payable: !!h.payable }));

      summaries.push(summary);

      // Save summary to attendanceSummaries collection
      const summaryRef = db.collection('attendanceSummaries').doc();
      batch.set(summaryRef, summary);
    }

    // Commit all summaries to database
    await batch.commit();
    console.log(`✅ Generated and saved ${summaries.length} attendance summaries`);

    // Convert summaries to records format for frontend compatibility
    const records = filteredRecords.map(record => ({
      ...record,
      isAbsent: record.status === 'Absent',
      isHalfDay: record.isHalfDay || (record.timeStatus && record.timeStatus.includes('Half Day')),
      minutesLate: record.totalMinutesLate || record.minutesLate || 0,
      minutesEarly: record.totalEarlyMinutes || record.minutesEarly || 0,
      minutesOvertime: record.totalOvertimeMinutes || record.minutesOvertime || 0,
      minutesUndertime: record.totalUndertimeMinutes || record.minutesUndertime || 0
    }));

    res.json({
      success: true,
      reportData: {
        records,
        summaries
      },
      source: 'calculated',
      message: `Generated ${summaries.length} attendance summaries from ${records.length} raw records`
    });

  } catch (error) {
    console.error('❌ Error generating attendance report:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Calculate summary for a single employee
function calculateEmployeeSummary(employeeId, records, startDate, endDate, companyId) {
  // Sort records by date
  records.sort((a, b) => new Date(a.date) - new Date(b.date));

  let totalRecords = records.length;
  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let leaveDays = 0;
  let sickLeaveDays = 0;
  let holidayDays = 0;
  let totalMinutesLate = 0;
  let totalEarlyMinutes = 0;
  let totalOvertimeMinutes = 0;
  let totalUndertimeMinutes = 0;
  let totalHalfDayMinutes = 0;

  // Process each record
  records.forEach(record => {
    switch (record.status) {
      case 'Present':
        presentDays++;
        break;
      case 'Absent':
        absentDays++;
        break;
      case 'Half Day':
        halfDays++;
        break;
      case 'Leave':
        leaveDays++;
        break;
      case 'Sick Leave':
        sickLeaveDays++;
        break;
      case 'Holiday':
        holidayDays++;
        break;
    }

    // Calculate time-based metrics if available
    if (record.totalMinutesLate) {
      totalMinutesLate += record.totalMinutesLate;
    }
    if (record.totalEarlyMinutes) {
      totalEarlyMinutes += record.totalEarlyMinutes;
    }
    if (record.totalOvertimeMinutes) {
      totalOvertimeMinutes += record.totalOvertimeMinutes;
    }
    if (record.totalUndertimeMinutes) {
      totalUndertimeMinutes += record.totalUndertimeMinutes;
    }
    if (record.totalHalfDayMinutes) {
      totalHalfDayMinutes += record.totalHalfDayMinutes;
    }
  });

  // Get employee name from first record
  const employeeName = records[0]?.employeeName || 'Unknown Employee';

  return {
    employeeId,
    employeeName,
    companyId,
    dateRange: `${startDate} to ${endDate}`,
    startDate,
    endDate,
    totalRecords,
    presentDays,
    absentDays,
    halfDays,
    leaveDays,
    sickLeaveDays,
    holidayDays,
    totalMinutesLate,
    totalEarlyMinutes,
    totalOvertimeMinutes,
    totalUndertimeMinutes,
    totalHalfDayMinutes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// Get attendance summaries
router.get('/getAttendanceSummaries', async (req, res) => {
  try {
    const { companyId, startDate, endDate, employeeId } = req.query;

    if (!companyId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, startDate, endDate'
      });
    }

    const dateRange = `${startDate} to ${endDate}`;
    let query = db.collection('attendanceSummaries')
      .where('companyId', '==', companyId)
      .where('dateRange', '==', dateRange);

    if (employeeId && employeeId !== 'ALL' && employeeId !== '') {
      query = query.where('employeeId', '==', employeeId);
    }

    const snapshot = await query.get();
    const summaries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      summaries
    });

  } catch (error) {
    console.error('❌ Error getting attendance summaries:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete attendance summaries
router.delete('/deleteAttendanceSummaries', async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.body;

    if (!companyId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: companyId, startDate, endDate'
      });
    }

    const dateRange = `${startDate} to ${endDate}`;
    const query = db.collection('attendanceSummaries')
      .where('companyId', '==', companyId)
      .where('dateRange', '==', dateRange);

    const snapshot = await query.get();
    
    if (snapshot.docs.length === 0) {
      return res.json({
        success: true,
        message: 'No summaries found to delete'
      });
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    res.json({
      success: true,
      message: `Deleted ${snapshot.docs.length} attendance summaries`
    });

  } catch (error) {
    console.error('❌ Error deleting attendance summaries:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

// Helper function to parse Excel/CSV and extract attendance records
async function parseAttendanceFile(fileBuffer, companyId) {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Get headers and normalize them
    const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
    console.log('File headers found:', headers);

    const normalizedHeaders = headers.reduce((acc, header) => {
      const normalized = header.trim().toLowerCase();
      acc[normalized] = header;
      return acc;
    }, {});

    const headerMapping = {
      employeeId: normalizedHeaders['employee id'],
      employeeName: normalizedHeaders['employee name'],
      department: normalizedHeaders['department'],
      position: normalizedHeaders['position'],
      date: normalizedHeaders['date'],
      status: normalizedHeaders['status'],
      timeIn: normalizedHeaders['time in'],
      timeOut: normalizedHeaders['time out'],
      notes: normalizedHeaders['notes'],
    };

    if (!headerMapping.employeeId || !headerMapping.date) {
      throw new Error('Missing required columns. Ensure "Employee ID" and "Date" columns exist.');
    }

    const jsonData = XLSX.utils.sheet_to_json(sheet);

    const records = jsonData.map((row, index) => {
      const employeeId = row[headerMapping.employeeId];
      if (!employeeId) {
        console.warn(`Skipping row ${index + 2} due to missing Employee ID.`);
        return null;
      }

      let date = row[headerMapping.date];
      try {
        if (date instanceof Date) {
          // Format date to YYYY-MM-DD
          date = date.toISOString().slice(0, 10);
        } else {
          // Handle numeric Excel dates
          const excelDate = Number(date);
          if (!isNaN(excelDate)) {
            date = new Date(Math.round((excelDate - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
          } else if (typeof date === 'string' && /\d{4}-\d{2}-\d{2}/.test(date)) {
            // Date is already in the correct format
          } else {
            throw new Error(`Invalid date format in row ${index + 2}. Expected YYYY-MM-DD or Excel date format.`);
          }
        }
      } catch (e) {
        console.error(`Error parsing date in row ${index + 2}:`, e);
        throw new Error(`Error parsing date in row ${index + 2}. Please use YYYY-MM-DD format.`);
      }

      return {
        employeeId: String(employeeId),
        employeeName: row[headerMapping.employeeName] || '',
        department: row[headerMapping.department] || '',
        position: row[headerMapping.position] || '',
        date: date,
        status: row[headerMapping.status] || 'Present',
        timeIn: row[headerMapping.timeIn] || '',
        timeOut: row[headerMapping.timeOut] || '',
        notes: row[headerMapping.notes] || '',
        companyId: companyId,
      };
    }).filter(record => record !== null);

    return records;
  } catch (error) {
    console.error('Error parsing attendance file:', error);
    throw new Error('Failed to parse the uploaded file. Please check the file format and column headers.');
  }
}

// Import attendance data from CSV/XLSX file
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const { companyId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Missing companyId.' });
    }

    const records = await parseAttendanceFile(file.buffer, companyId);

    const { successCount, errors } = await processBulkAttendance(records);

    res.json({
      success: true,
      message: `Successfully imported ${successCount} attendance records.`,
      importedCount: successCount,
      errors: errors,
    });

  } catch (error) {
    console.error('❌ Error importing attendance data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload biometric data from Excel file
router.post('/biometric-upload', upload.single('file'), async (req, res) => {
  try {
    const { companyId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Missing companyId.' });
    }

    // Assuming biometric data has a similar structure for now, or can be adapted
    const records = await parseAttendanceFile(file.buffer, companyId); // Re-using for now

    const { successCount, errors } = await processBulkAttendance(records);

    res.json({
      success: true,
      message: `Successfully uploaded ${successCount} biometric records.`,
      uploadedCount: successCount,
      errors: errors,
    });

  } catch (error) {
    console.error('❌ Error uploading biometric data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});





