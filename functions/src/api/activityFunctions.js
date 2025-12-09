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

// Allow managers to view activity timeline as well
const ALLOWED_ROLES = new Set(['superadmin', 'admin', 'audit', 'payroll', 'hr', 'manager']);

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
    console.error('⛔ [ACTIVITY TEST] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  console.log('🔥 [ACTIVITY] GET / endpoint hit!');
  console.log('🔥 [ACTIVITY] req.user:', req.user);
  console.log('🔥 [ACTIVITY] Query params:', req.query);
  try {
    if (!ensureRoleAccess(req)) {
      console.log('⛔ [ACTIVITY] Access denied - user role not allowed');
      console.log('⛔ [ACTIVITY] User specialrole:', req.user?.specialrole);
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: 'You do not have permission to view activity logs.',
      });
    }
    console.log('✅ [ACTIVITY] Access granted');

    const userRole = (req.user?.specialrole || '').toLowerCase();
    const companyId = req.query.companyId ? String(req.query.companyId).trim() : null;
    console.log('🔍 [ACTIVITY] User role:', userRole);
    console.log('🔍 [ACTIVITY] CompanyId:', companyId || 'ALL COMPANIES');

    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    let moduleFilter = req.query.module ? String(req.query.module).trim() : null;
    const actionFilter = req.query.action ? String(req.query.action).trim() : null;
    const actorFilter = req.query.actor ? String(req.query.actor).trim() : null;
    const cursorId = req.query.cursor ? String(req.query.cursor).trim() : null;

    // Force audit users to only see audit module logs
    if (userRole === 'audit' && !moduleFilter) {
      moduleFilter = 'audit';
      console.log('🔒 [ACTIVITY] Audit role detected - forcing module filter to "audit"');
    }

    console.log('🔍 [ACTIVITY] Query filters:', { limit, moduleFilter, actionFilter, actorFilter, cursorId });

    const db = firestore();
    // Use collectionGroup to query all 'historyLogs' subcollections across all users
    const activityCollection = db.collectionGroup('historyLogs');

    console.log('🔍 [ACTIVITY] Querying global historyLogs collection group');

    let snapshot;
    try {
      // Try sorted query first
      let query = activityCollection.orderBy('performedAt', 'desc');
      
      // Apply module filter if present
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
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      console.log('🔍 [ACTIVITY] Executing SORTED Firestore query...');
      snapshot = await query.limit(limit + 1).get();
    
    } catch (sortError) {
      console.warn('⚠️ [ACTIVITY] Sorted query failed (likely missing index). Falling back to unsorted query + in-memory sort.');
      console.warn('⚠️ [ACTIVITY] Error details:', sortError.message);
      
      // Fallback: Unsorted query
      let query = activityCollection;
      
      // Re-apply filters (basic equality filters work without composite indexes usually)
      if (moduleFilter) query = query.where('module', '==', moduleFilter);
      if (actionFilter) query = query.where('action', '==', actionFilter);
      if (actorFilter) query = query.where('actor.uid', '==', actorFilter);

      // Note: Pagination (cursor) is hard to do correctly in fallback without sorting, 
      // so we might just fetch the first batch or skip cursor for the fallback to be safe.
      
      console.log('🔍 [ACTIVITY] Executing UNSORTED fallback query...');
      snapshot = await query.limit(limit + 1).get();
    }

    console.log('🔍 [ACTIVITY] Query returned', snapshot.size, 'documents');
    const docs = snapshot.docs;
    
    // Normalize AND Sort (needed for fallback)
    let entries = docs.map(normalizeActivityDoc);
    
    // Always sort in memory to ensure consistent "Latest to Oldest" order
    // (Even if Firestore sorted it, this is cheap for page size 50)
    entries.sort((a, b) => {
      const dateA = new Date(a.performedAt || 0);
      const dateB = new Date(b.performedAt || 0);
      return dateB - dateA; // Descending (Newest first)
    });

    // Handle pagination manually after sort if we fell back? 
    // Actually, true pagination requires the DB sort. 
    // This fallback is just to show *some* data. The 'nextCursor' might be wonky in fallback mode.
    
    const sliced = entries.slice(0, limit);
    console.log('🔍 [ACTIVITY] Normalized', sliced.length, 'entries');
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


// Clear all activity logs (Super Admin only)
router.delete('/', async (req, res) => {
  try {
    // Verify superadmin role - allowing 'admin' too for this temp button as requested
    const role = (req.user?.specialrole || '').toLowerCase();
    if (!req.user || (role !== 'superadmin' && role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: 'Only Super Admins or Admins can clear activity logs.',
      });
    }

    const db = firestore();
    const activityCollection = db.collection('activityLogs');

    // Batch delete (up to 500)
    const snapshot = await activityCollection.limit(500).get();

    if (snapshot.empty) {
      return res.json({
        success: true,
        message: 'No activity logs to delete.',
        count: 0
      });
    }

    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();

    return res.json({
      success: true,
      message: `Successfully deleted ${count} activity logs.`,
      count
    });
  } catch (error) {
    console.error('Failed to clear activity logs:', error);
    return res.status(500).json({
      success: false,
      error: 'internal',
      message: 'Failed to clear activity logs.',
    });
  }
});

module.exports = router;