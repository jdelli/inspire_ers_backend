/**
 * Error Reporting Functions - Phase 6.3
 * Backend API endpoints for receiving client-side error reports
 */

const admin = require('firebase-admin');
const db = admin.firestore();
const errorHandler = require('../utils/errorHandler');
const securityMiddleware = require('../middleware/securityMiddleware');

/**
 * POST /api/errors
 * Report error from client
 */
exports.reportError = [
  // Middleware stack - basic only, no company validation needed for error reports
  (req, res, next) => {
    // CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  },

  async (req, res) => {
    const startTime = Date.now();

    try {
      const {
        message,
        code,
        name,
        statusCode,
        stack,
        userAgent,
        url,
        component,
        userId,
        companyId,
        metadata = {},
        severity = 'error'
      } = req.body;

      // Validate required fields
      if (!message || !code) {
        return res.status(400).json(errorHandler.formatError(
          errorHandler.createError('Missing required fields: message, code', 'INVALID_INPUT')
        ));
      }

      // Sanitize input
      const sanitizedReport = {
        message: String(message).substring(0, 500),
        code: String(code).substring(0, 100),
        name: String(name).substring(0, 100),
        statusCode: parseInt(statusCode) || 500,
        stack: String(stack).substring(0, 2000),
        userAgent: String(userAgent).substring(0, 500),
        url: String(url).substring(0, 500),
        component: String(component).substring(0, 100),
        userId: userId ? String(userId).substring(0, 100) : null,
        companyId: companyId ? String(companyId).substring(0, 100) : null,
        metadata: typeof metadata === 'object' ? metadata : {},
        severity: String(severity).substring(0, 50)
      };

      // Store in Firestore
      const docRef = await db.collection('client_errors').add({
        ...sanitizedReport,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        ipAddress: req.ip,
        hostname: req.hostname,
        processed: false
      });

      // Log to console
      console.log(`[${severity.toUpperCase()}] Client error: ${code} - ${message}`, {
        component,
        userId,
        companyId
      });

      // Check if error threshold exceeded
      try {
        await errorHandler.checkErrorThreshold(code, 20, 1);
      } catch (thresholdError) {
        console.error('Error checking threshold:', thresholdError);
      }

      return res.status(200).json({
        success: true,
        code: 'error-reported',
        message: 'Error report received and logged',
        reportId: docRef.id,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      console.error('Error in reportError:', error);

      return res.status(500).json(errorHandler.formatError(
        errorHandler.createError('Failed to report error', 'INTERNAL_ERROR')
      ));
    }
  }
];

/**
 * POST /api/errors/batch
 * Report batch of errors from client
 */
exports.reportErrorBatch = [
  (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  },

  async (req, res) => {
    const startTime = Date.now();

    try {
      const { errors = [], batchIndex = 0, totalBatches = 1 } = req.body;

      if (!Array.isArray(errors) || errors.length === 0) {
        return res.status(400).json(errorHandler.formatError(
          errorHandler.createError('Invalid batch: errors must be a non-empty array', 'INVALID_INPUT')
        ));
      }

      // Use batch write for efficiency
      const batch = db.batch();
      let processedCount = 0;
      let errorCount = 0;

      for (const errorReport of errors) {
        try {
          const docRef = db.collection('client_errors').doc();
          batch.set(docRef, {
            message: String(errorReport.message).substring(0, 500),
            code: String(errorReport.code).substring(0, 100),
            name: String(errorReport.name).substring(0, 100),
            statusCode: parseInt(errorReport.statusCode) || 500,
            stack: String(errorReport.stack).substring(0, 2000),
            userAgent: String(errorReport.userAgent).substring(0, 500),
            url: String(errorReport.url).substring(0, 500),
            component: String(errorReport.component).substring(0, 100),
            userId: errorReport.userId ? String(errorReport.userId).substring(0, 100) : null,
            companyId: errorReport.companyId ? String(errorReport.companyId).substring(0, 100) : null,
            metadata: typeof errorReport.metadata === 'object' ? errorReport.metadata : {},
            severity: String(errorReport.severity).substring(0, 50),
            receivedAt: admin.firestore.FieldValue.serverTimestamp(),
            ipAddress: req.ip,
            batchIndex: batchIndex,
            totalBatches: totalBatches,
            queuedAt: errorReport.queuedAt || null,
            processed: false
          });
          processedCount++;
        } catch (itemError) {
          console.error('Error processing batch item:', itemError);
          errorCount++;
        }
      }

      // Commit batch
      await batch.commit();

      console.log(`Batch ${batchIndex + 1}/${totalBatches} processed: ${processedCount} errors`, {
        failed: errorCount
      });

      return res.status(200).json({
        success: true,
        code: 'batch-reported',
        message: `Batch processed: ${processedCount} errors received`,
        processedCount: processedCount,
        failedCount: errorCount,
        batchIndex: batchIndex,
        processingTime: Date.now() - startTime
      });
    } catch (error) {
      console.error('Error in reportErrorBatch:', error);

      return res.status(500).json(errorHandler.formatError(
        errorHandler.createError('Failed to process error batch', 'INTERNAL_ERROR')
      ));
    }
  }
];

/**
 * GET /api/errors/stats
 * Get error statistics (admin only)
 */
exports.getErrorStats = [
  securityMiddleware.authenticateUser,
  securityMiddleware.rateLimit(100, 60000), // 100 per minute

  async (req, res) => {
    try {
      const { hoursBack = 24, companyId = null } = req.query;

      // Only admins can view all errors, otherwise filter by company
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      const userRole = userDoc.data()?.role;
      const userCompanyId = userDoc.data()?.companyId;

      const actualCompanyId = userRole === 'admin' ? companyId : userCompanyId;

      // Get stats from Firestore
      const stats = await errorHandler.getErrorStats(actualCompanyId, parseInt(hoursBack));

      return res.status(200).json({
        success: true,
        ...stats
      });
    } catch (error) {
      console.error('Error getting error stats:', error);

      return res.status(500).json(errorHandler.formatError(
        errorHandler.createError('Failed to retrieve error statistics', 'INTERNAL_ERROR')
      ));
    }
  }
];

/**
 * GET /api/errors/client-stats
 * Get client error statistics (admin only)
 */
exports.getClientErrorStats = [
  securityMiddleware.authenticateUser,
  securityMiddleware.rateLimit(50, 60000), // 50 per minute

  async (req, res) => {
    try {
      const { hoursBack = 24, companyId = null, component = null } = req.query;

      const userDoc = await db.collection('users').doc(req.user.uid).get();
      const userRole = userDoc.data()?.role;

      if (userRole !== 'admin') {
        return res.status(403).json(errorHandler.formatError(
          errorHandler.createError('Admin access required', 'PERMISSION_DENIED')
        ));
      }

      const cutoffTime = new Date(Date.now() - parseInt(hoursBack) * 60 * 60 * 1000);

      let query = db.collection('client_errors')
        .where('receivedAt', '>=', cutoffTime)
        .orderBy('receivedAt', 'desc');

      if (companyId) {
        query = query.where('companyId', '==', companyId);
      }

      if (component) {
        query = query.where('component', '==', component);
      }

      const snapshot = await query.limit(1000).get();
      const errors = snapshot.docs.map(doc => doc.data());

      // Calculate statistics
      const stats = {
        totalErrors: errors.length,
        byCode: {},
        bySeverity: { error: 0, warning: 0, info: 0 },
        byComponent: {},
        byUser: {},
        recentErrors: errors.slice(0, 20)
      };

      for (const error of errors) {
        stats.byCode[error.code] = (stats.byCode[error.code] || 0) + 1;
        stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
        stats.byComponent[error.component] = (stats.byComponent[error.component] || 0) + 1;
        if (error.userId) {
          stats.byUser[error.userId] = (stats.byUser[error.userId] || 0) + 1;
        }
      }

      return res.status(200).json({
        success: true,
        timeRange: { from: cutoffTime, to: new Date(), hours: parseInt(hoursBack) },
        companyId: companyId,
        stats: stats
      });
    } catch (error) {
      console.error('Error getting client error stats:', error);

      return res.status(500).json(errorHandler.formatError(
        errorHandler.createError('Failed to retrieve client error statistics', 'INTERNAL_ERROR')
      ));
    }
  }
];

/**
 * DELETE /api/errors/:errorId
 * Mark error as processed (admin only)
 */
exports.markErrorProcessed = [
  securityMiddleware.authenticateUser,
  securityMiddleware.rateLimit(100, 60000),

  async (req, res) => {
    try {
      const { errorId } = req.params;

      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (userDoc.data()?.role !== 'admin') {
        return res.status(403).json(errorHandler.formatError(
          errorHandler.createError('Admin access required', 'PERMISSION_DENIED')
        ));
      }

      await db.collection('client_errors').doc(errorId).update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        message: 'Error marked as processed',
        errorId: errorId
      });
    } catch (error) {
      console.error('Error marking error processed:', error);

      return res.status(500).json(errorHandler.formatError(
        errorHandler.createError('Failed to mark error as processed', 'INTERNAL_ERROR')
      ));
    }
  }
];

module.exports = exports;
