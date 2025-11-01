const express = require('express');
const admin = require('../utils/firebaseAdmin');

const router = express.Router();

console.log('📦 [ACTIVITY FUNCTIONS] Module loaded, setting up routes...');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const ALLOWED_ROLES = new Set(['superadmin', 'audit', 'payroll', 'hr']);

const toIsoString = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value._seconds !== undefined && value._nanoseconds !== undefined) {
    return new Date(value._seconds * 1000).toISOString();
  }
  return null;
};

const normalizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    return metadata;
  }
};

const normalizeRequest = (request = {}) => {
  if (!request || typeof request !== 'object') {
    return {};
  }
  return {
    requestId: request.requestId || null,
    ipAddress: request.ipAddress || null,
    forwardedFor: Array.isArray(request.forwardedFor) ? request.forwardedFor : [],
    userAgent: request.userAgent || null,
  };
};

const normalizeActivityDoc = (doc) => {
  const data = doc.data() || {};
  return {
    id: doc.id,
    module: data.module || null,
    action: data.action || null,
    companyId: data.companyId || null,
    entityType: data.entityType || null,
    entityId: data.entityId || null,
    summary: data.summary || '',
    metadata: normalizeMetadata(data.metadata),
    actor: {
      uid: data.actor?.uid || null,
      email: data.actor?.email || null,
      role: data.actor?.role || null,
    },
    request: normalizeRequest(data.request),
    performedAt: toIsoString(data.performedAt),
  };
};

const ensureRoleAccess = (req) => {
  if (!req.user) {
    return false;
  }
  const role = (req.user.specialrole || '').toLowerCase();
  if (ALLOWED_ROLES.has(role)) {
    return true;
  }
  return false;
};

// Test endpoint to create a sample activity log
console.log('🔧 [ACTIVITY FUNCTIONS] Registering POST /test-create route...');
router.post('/test-create', async (req, res) => {
  console.log('🧪🧪🧪 [ACTIVITY TEST] /test-create POST HANDLER CALLED!!!');
  console.log('🧪 [ACTIVITY TEST] Creating test activity log...');
  try {
    const { recordActivity } = require('../services/activityLogService');

    const testLog = await recordActivity({
      module: 'hr',
      action: 'EMPLOYEE_RECORD_UPDATED',
      companyId: 'denmark-company',
      entityType: 'employee',
      entityId: 'test-employee-' + Date.now(),
      summary: 'Test activity log created via API endpoint',
      metadata: {
        test: true,
        createdVia: 'test-create endpoint',
        timestamp: new Date().toISOString()
      },
      context: {
        user: req.user,
        request: {
          requestId: req.requestId,
          ipAddress: req.ipAddress,
          forwardedFor: req.forwardedFor || [],
          userAgent: req.headers['user-agent'] || null
        }
      }
    });

    console.log('✅ [ACTIVITY TEST] Test log created successfully!');
    console.log('✅ [ACTIVITY TEST] Log ID:', testLog);
    return res.json({
      success: true,
      message: 'Test activity log created',
      logId: testLog
    });
  } catch (error) {
    console.error('❌ [ACTIVITY TEST] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  console.log('🔥 [ACTIVITY] GET / endpoint hit!');
  console.log('🔥 [ACTIVITY] req.user:', req.user);
  console.log('🔥 [ACTIVITY] Query params:', req.query);
  try {
    if (!ensureRoleAccess(req)) {
      console.log('❌ [ACTIVITY] Access denied - user role not allowed');
      console.log('❌ [ACTIVITY] User specialrole:', req.user?.specialrole);
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: 'You do not have permission to view activity logs.',
      });
    }
    console.log('✅ [ACTIVITY] Access granted');

    const companyId = String(req.query.companyId || '').trim();
    console.log('🔍 [ACTIVITY] CompanyId:', companyId);
    if (!companyId) {
      console.log('❌ [ACTIVITY] No companyId provided');
      return res.status(400).json({
        success: false,
        error: 'invalid-argument',
        message: 'companyId is required.',
      });
    }

    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const moduleFilter = req.query.module ? String(req.query.module).trim() : null;
    const actionFilter = req.query.action ? String(req.query.action).trim() : null;
    const actorFilter = req.query.actor ? String(req.query.actor).trim() : null;
    const cursorId = req.query.cursor ? String(req.query.cursor).trim() : null;

    console.log('🔍 [ACTIVITY] Query filters:', { limit, moduleFilter, actionFilter, actorFilter, cursorId });

    const db = firestore();
    const activityCollection = db.collection('activityLogs');

    console.log('🔍 [ACTIVITY] Querying global activityLogs collection');

    let query = activityCollection
      .where('companyId', '==', companyId)
      .orderBy('performedAt', 'desc');

    if (moduleFilter) {
      query = query.where('module', '==', moduleFilter);
    }

    if (actionFilter) {
      query = query.where('action', '==', actionFilter);
    }

    if (actorFilter) {
      query = query.where('actor.uid', '==', actorFilter);
    }

    if (cursorId) {
  const cursorDoc = await activityCollection.doc(cursorId).get();
      if (!cursorDoc.exists) {
        return res.status(400).json({
          success: false,
          error: 'invalid-argument',
          message: 'Invalid cursor provided.',
        });
      }
      query = query.startAfter(cursorDoc);
    }

    console.log('🔍 [ACTIVITY] Executing Firestore query...');
    const snapshot = await query.limit(limit + 1).get();
    console.log('🔍 [ACTIVITY] Query returned', snapshot.size, 'documents');
    const docs = snapshot.docs;
    const sliced = docs.slice(0, limit);

    const entries = sliced.map(normalizeActivityDoc);
    console.log('🔍 [ACTIVITY] Normalized', entries.length, 'entries');
    console.log('🔍 [ACTIVITY] First entry:', entries[0] ? JSON.stringify(entries[0], null, 2) : 'None');

    const nextCursor = docs.length > limit ? docs[limit].id : null;
    const moduleSet = new Set(entries.map((entry) => entry.module).filter(Boolean));
    const actionSet = new Set(entries.map((entry) => entry.action).filter(Boolean));

    console.log('✅ [ACTIVITY] Returning response with', entries.length, 'entries');
    return res.json({
      success: true,
      entries,
      nextCursor,
      hasMore: Boolean(nextCursor),
      modules: Array.from(moduleSet).sort(),
      actions: Array.from(actionSet).sort(),
    });
  } catch (error) {
    console.error('Failed to list activity logs:', error);
    return res.status(500).json({
      success: false,
      error: 'internal',
      message: 'Failed to load activity logs.',
    });
  }
});

console.log('✅ [ACTIVITY FUNCTIONS] All routes registered, exporting router...');
console.log('📋 [ACTIVITY FUNCTIONS] Routes:', router.stack.map(r => `${Object.keys(r.route?.methods || {}).join(',')} ${r.route?.path || 'middleware'}`).join(', '));

module.exports = router;
