const admin = require('../utils/firebaseAdmin');
const { randomUUID } = require('crypto');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

// Deduplication cache to prevent duplicate logs within 5 seconds
const recentActivityCache = new Map();
const DEDUP_WINDOW_MS = 5000; // 5 seconds

// Clean up old cache entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentActivityCache.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentActivityCache.delete(key);
    }
  }
}, 60000);

const ActivityCollections = {
  GLOBAL: 'activityLogs',
  COMPANY: 'activityLogs',
};

const buildActor = (context = {}) => {
  if (!context.user) {
    return { uid: null, email: null, role: null };
  }
  return {
    uid: context.user.uid || null,
    email: context.user.email || null,
    role: context.user.specialrole || context.user.role || null,
  };
};

const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.slice(0, 50);
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const recordActivity = async (payload = {}) => {
  console.log('🎯 [ACTIVITY SERVICE] recordActivity called!');
  console.log('🎯 [ACTIVITY SERVICE] Payload:', JSON.stringify(payload, null, 2));

  const {
    module = 'general',
    action,
    companyId = null,
    entityType = null,
    entityId = null,
    summary = '',
    metadata = {},
    context = {},
  } = payload;

  console.log('🎯 [ACTIVITY SERVICE] Parsed values:', { module, action, companyId, entityType, entityId, summary });

  if (!action) {
    console.error('❌ [ACTIVITY SERVICE] No action provided!');
    throw new Error('Activity action is required');
  }

  const db = firestore();
  const actor = buildActor(context);
  const sanitized = sanitizeMetadata(metadata);

  // Create deduplication key based on critical fields (after building actor)
  const dedupKey = `${action}:${companyId}:${entityType}:${entityId}:${actor.uid}:${JSON.stringify(sanitized)}`;
  const now = Date.now();
  const lastSeen = recentActivityCache.get(dedupKey);

  // Check if this exact activity was logged recently (within 5 seconds)
  if (lastSeen && (now - lastSeen) < DEDUP_WINDOW_MS) {
    console.log('⚠️ [ACTIVITY SERVICE] Duplicate activity detected, skipping log');
    console.log('⚠️ [ACTIVITY SERVICE] Last seen:', Math.round((now - lastSeen) / 1000), 'seconds ago');
    return null; // Skip duplicate
  }

  // Update cache with current timestamp
  recentActivityCache.set(dedupKey, now);

  const requestMeta = context.request?.requestContext || context.request || {};
  const ipAddress = requestMeta.ipAddress || requestMeta.ip || null;
  // Normalize forwardedFor as an array to match frontend rendering expectations
  const forwardedFor = Array.isArray(requestMeta.forwardedFor)
    ? requestMeta.forwardedFor
    : (typeof requestMeta.forwardedFor === 'string'
      ? requestMeta.forwardedFor.split(',').map((s) => s.trim()).filter(Boolean)
      : null);
  const userAgent = requestMeta.userAgent || null;
  const requestId = requestMeta.requestId || randomUUID();

  const activityRecord = {
    module,
    action,
    companyId,
    entityType,
    entityId,
    summary,
    metadata: sanitized,
    actor,
    performedAt: admin.firestore.FieldValue.serverTimestamp(),
    request: {
      ipAddress,
      forwardedFor,
      userAgent,
      requestId,
    },
  };

  const batch = db.batch();
  const globalRef = db.collection(ActivityCollections.GLOBAL).doc();
  batch.set(globalRef, activityRecord);

  if (companyId) {
    const companyRef = db
      .collection('companies')
      .doc(String(companyId))
      .collection(ActivityCollections.COMPANY)
      .doc(globalRef.id);
    batch.set(companyRef, activityRecord);
  }

  // Also write to user-scoped history if this activity pertains to a user entity
  if (entityType === 'user' && entityId) {
    const userRef = db
      .collection('users')
      .doc(String(entityId))
      .collection('historyLogs')
      .doc(globalRef.id);
    batch.set(userRef, activityRecord);
  }

  // Always record under the ACTOR's user history if available
  if (actor && actor.uid) {
    const actorRef = db
      .collection('users')
      .doc(String(actor.uid))
      .collection('historyLogs')
      .doc(globalRef.id);
    batch.set(actorRef, activityRecord);
  }

  console.log('🎯 [ACTIVITY SERVICE] Committing batch write...');
  await batch.commit();
  console.log('✅ [ACTIVITY SERVICE] Activity record saved successfully with ID:', globalRef.id);

  return {
    id: globalRef.id,
    ...activityRecord,
  };
};

module.exports = {
  recordActivity,
};
