const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const attendanceService = require('../services/attendanceService');

const router = express.Router();

router.use(authMiddleware);
router.use(rateLimitMiddleware);

const mapServiceErrorToStatus = (error) => {
  switch (error?.code) {
    case 'invalid-argument':
      return 400;
    case 'not-found':
      return 404;
    case 'failed-precondition':
      return 412;
    case 'permission-denied':
      return 403;
    default:
      return 500;
  }
};

/**
 * POST /process
 * Process attendance record - calculate status, durations, and save
 * Body: { employeeId, date, timeIn, timeOut, companyId? }
 * If companyId is not provided in body, it will use the first company from user's companies list
 */
router.post('/process', async (req, res) => {
  try {
    // Get companyId from body or fallback to user's first company
    let companyId = req.body?.companyId;
    if (!companyId && req.user?.companies && Array.isArray(req.user.companies)) {
      companyId = req.user.companies[0];
    }

    const result = await attendanceService.processAttendance(
      { ...req.body, companyId },
      {
        userId: req.user?.uid,
        email: req.user?.email,
        companyId: companyId,
      }
    );
    res.status(201).json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to process attendance.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /bulk-process
 * Bulk process attendance records
 * Body: { attendanceRecords: [{ employeeId, date, timeIn, timeOut, companyId? }], ... }
 * If companyId is not provided in records, it will use the first company from user's companies list
 */
router.post('/bulk-process', async (req, res) => {
  try {
    let { attendanceRecords } = req.body;

    // Get default companyId from user's first company if not provided in records
    let defaultCompanyId = req.user?.companies && Array.isArray(req.user.companies)
      ? req.user.companies[0]
      : null;

    // Ensure each record has a companyId
    if (defaultCompanyId && attendanceRecords && Array.isArray(attendanceRecords)) {
      attendanceRecords = attendanceRecords.map(record => ({
        ...record,
        companyId: record.companyId || defaultCompanyId,
      }));
    }

    const result = await attendanceService.bulkProcessAttendance(attendanceRecords, {
      userId: req.user?.uid,
      email: req.user?.email,
      companyId: defaultCompanyId,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to bulk process attendance.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /report
 * Generate attendance report with statistics
 * Body: { companyId, startDate, endDate, employeeId (optional), department (optional) }
 */
router.post('/report', async (req, res) => {
  try {
    const result = await attendanceService.generateAttendanceReport(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate attendance report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /report
 * Generate attendance report via query parameters
 * Query params: companyId, startDate, endDate, employeeId (optional), department (optional)
 */
router.get('/report', async (req, res) => {
  try {
    const result = await attendanceService.generateAttendanceReport(req.query, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to generate attendance report.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /calculate-time-status
 * Calculate time status for a specific record without saving
 * Body: { timeIn, timeOut, startTime, endTime }
 * Useful for preview/validation before processing
 */
router.post('/calculate-time-status', async (req, res) => {
  try {
    const { timeIn, timeOut, startTime = '09:00', endTime = '17:00' } = req.body;

    if (!timeIn || !timeOut) {
      return res.status(400).json({
        success: false,
        message: 'timeIn and timeOut are required',
        code: 'invalid-argument',
      });
    }

    const schedule = { startTime, endTime };
    const timeRecord = { timeIn, timeOut };

    const status = attendanceService.calculateTimeStatus(timeRecord, schedule);

    res.json({
      success: true,
      status,
      message: 'Time status calculated successfully',
    });
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to calculate time status.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * GET /records
 * Query: companyId, date? or startDate+endDate, employeeId?
 */
router.get('/records', async (req, res) => {
  try {
    const result = await attendanceService.listTimeRecords(req.query);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to list time records.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

/**
 * POST /delete
 * Body: { recordId } or { employeeId, date, companyId? }
 */
router.post('/delete', async (req, res) => {
  try {
    const result = await attendanceService.deleteTimeRecord(req.body);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to delete time record.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

// Schedules
router.get('/schedules', async (req, res) => {
  try {
    const result = await attendanceService.listSchedules(req.query);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to list schedules.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

router.post('/schedules', async (req, res) => {
  try {
    const result = await attendanceService.saveSchedule(req.body, {
      userId: req.user?.uid,
      email: req.user?.email,
    });
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to save schedule.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

router.post('/schedules/delete', async (req, res) => {
  try {
    const result = await attendanceService.deleteSchedule(req.body);
    res.json(result);
  } catch (error) {
    const status = mapServiceErrorToStatus(error);
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to delete schedule.',
      code: error.code || 'internal',
      details: error.details,
    });
  }
});

module.exports = router;
