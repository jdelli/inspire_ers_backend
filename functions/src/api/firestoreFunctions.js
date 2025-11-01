const express = require('express');
const initializeFirebaseAdmin = require('../config/firebase');
const { recordActivity } = require('../services/activityLogService');

// Initialize Firebase Admin
const admin = initializeFirebaseAdmin();
const db = admin.firestore();
const router = express.Router();

// ============================================================================
// FIRESTORE API ENDPOINTS (for frontend compatibility)
// ============================================================================

// Query collection with filters and ordering
router.post('/query', async (req, res) => {
  console.log('🔥 [FIRESTORE] /query endpoint hit!');
  console.log('🔥 [FIRESTORE] Request body:', JSON.stringify(req.body, null, 2));
  try {
    const { collection, filters = [], orderBy = [], limit, limitToLast, startAt, startAfter, endAt, endBefore } = req.body;
    
    console.log('🔍 Firestore query:', { collection, filters, orderBy });

    if (!collection) {
      console.log('❌ [FIRESTORE] No collection provided');
      return res.status(400).json({
        success: false,
        error: 'Collection path is required'
      });
    }

    let query = db.collection(collection);

    // Apply filters
    for (const filter of filters) {
      const { field, op, value } = filter;
      query = query.where(field, op, value);
    }

    // Apply ordering
    for (const order of orderBy) {
      const { field, direction = 'asc' } = order;
      query = query.orderBy(field, direction);
    }

    // Apply limits
    if (limit) {
      query = query.limit(limit);
    } else if (limitToLast) {
      query = query.limitToLast(limitToLast);
    }

    // Apply cursors
    if (startAt) {
      query = query.startAt(startAt);
    }
    if (startAfter) {
      query = query.startAfter(startAfter);
    }
    if (endAt) {
      query = query.endAt(endAt);
    }
    if (endBefore) {
      query = query.endBefore(endBefore);
    }

    console.log('🔍 [FIRESTORE] Executing query...');
    const snapshot = await query.get();
    console.log('🔍 [FIRESTORE] Query executed, snapshot size:', snapshot.size);
    
    const docs = snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));

    console.log(`📊 Query returned ${docs.length} documents`);
    console.log(`📊 First doc sample:`, docs[0] ? JSON.stringify(docs[0], null, 2) : 'No docs');

    res.json({
      success: true,
      docs,
      size: docs.length
    });

  } catch (error) {
    console.error('❌ Firestore query error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single document
router.post('/get', async (req, res) => {
  console.log('🔥 [FIRESTORE] /get endpoint hit!');
  console.log('🔥 [FIRESTORE] Request body:', JSON.stringify(req.body, null, 2));
  try {
    const { collection, id } = req.body;
    
    console.log('🔍 Firestore getDoc:', { collection, id });

    if (!collection || !id) {
      console.log('❌ [FIRESTORE] Missing collection or id');
      return res.status(400).json({
        success: false,
        error: 'Collection and id are required'
      });
    }

    const docRef = db.collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.json({
        success: true,
        doc: null
      });
    }

    res.json({
      success: true,
      doc: {
        id: doc.id,
        data: doc.data()
      }
    });

  } catch (error) {
    console.error('❌ Firestore getDoc error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add document
router.post('/add', async (req, res) => {
  try {
    const { collection, data } = req.body;
    
    console.log('🔍 Firestore addDoc:', { collection });

    if (!collection || !data) {
      return res.status(400).json({
        success: false,
        error: 'Collection and data are required'
      });
    }

    const docRef = await db.collection(collection).add(data);
    console.log(`✅ Document added with ID: ${docRef.id}`);

    res.json({
      success: true,
      id: docRef.id
    });

  } catch (error) {
    console.error('❌ Firestore addDoc error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Set document (create or replace)
router.post('/set', async (req, res) => {
  try {
    const { collection, id, data, options = {} } = req.body;
    
    console.log('🔍 Firestore setDoc:', { collection, id });

    if (!collection || !id || !data) {
      return res.status(400).json({
        success: false,
        error: 'Collection, id, and data are required'
      });
    }

    const docRef = db.collection(collection).doc(id);
    
    if (options.merge) {
      await docRef.set(data, { merge: true });
    } else {
      await docRef.set(data);
    }

    console.log(`✅ Document set with ID: ${id}`);

    res.json({
      success: true,
      id
    });

  } catch (error) {
    console.error('❌ Firestore setDoc error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update document
router.post('/update', async (req, res) => {
  console.log('🔥🔥🔥 [FIRESTORE] /update endpoint HIT!');
  console.log('🔥🔥🔥 [FIRESTORE] Request body:', JSON.stringify(req.body, null, 2));
  console.log('🔥🔥🔥 [FIRESTORE] User:', req.user);
  try {
    const { collection, id, data } = req.body;

    console.log('🔍 Firestore updateDoc:', { collection, id, data });
    console.log('🔍 Request user:', req.user);

    if (!collection || !id || !data) {
      return res.status(400).json({
        success: false,
        error: 'Collection, id, and data are required'
      });
    }

    // Convert date strings to Firestore Timestamps
    const processedData = { ...data };
    for (const [key, value] of Object.entries(processedData)) {
      if (value && typeof value === 'string') {
        // Check if it's an ISO date string
        const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
        if (dateRegex.test(value)) {
          processedData[key] = admin.firestore.Timestamp.fromDate(new Date(value));
        }
      } else if (value instanceof Date) {
        processedData[key] = admin.firestore.Timestamp.fromDate(value);
      }
    }

    const docRef = db.collection(collection).doc(id);

    const existingSnapshot = await docRef.get();
    const existingData = existingSnapshot.exists ? existingSnapshot.data() : {};

    await docRef.update(processedData);

    console.log(`✅ Document updated with ID: ${id}`, processedData);

    // Record activity for employee updates
    if (collection.includes('employees') && req.user) {
      try {
        const updatedFields = Object.keys(data).filter(key => key !== 'updatedAt');
        const companyIdForActivity = data.companyId ?? existingData?.companyId ?? null;

        // Track what actually changed (old value → new value)
        const changes = {};
        updatedFields.forEach(field => {
          const oldValue = existingData[field];
          const newValue = data[field];

          // Only log if value actually changed
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes[field] = {
              from: oldValue !== undefined ? oldValue : null,
              to: newValue !== undefined ? newValue : null
            };
          }
        });

        const changedFieldNames = Object.keys(changes);

        // Only log if there are actual changes
        if (changedFieldNames.length > 0) {
          await recordActivity({
            module: 'hr',
            action: 'EMPLOYEE_RECORD_UPDATED',
            companyId: companyIdForActivity,
            entityType: 'employee',
            entityId: id,
            summary: `Updated employee record: ${changedFieldNames.join(', ')}`,
            metadata: {
              collection,
              updatedFields: changedFieldNames,
              changes: changes,
              documentId: id,
              companyId: companyIdForActivity,
              employeeName: existingData?.firstName && existingData?.lastName
                ? `${existingData.firstName} ${existingData.lastName}`
                : 'Unknown Employee'
            },
            context: {
              user: req.user,
              request: {
                requestId: req.requestId,
                ipAddress: req.ipAddress,
                forwardedFor: req.forwardedFor || [],
                userAgent: req.headers['user-agent'] || null
              }
            },
          });
          console.log('✅ Activity logged for employee update with changes:', changedFieldNames);
        } else {
          console.log('ℹ️ No actual changes detected, skipping activity log');
        }
      } catch (activityError) {
        console.error('⚠️ Failed to log activity:', activityError);
        // Don't fail the request if activity logging fails
      }
    }

    res.json({
      success: true,
      id
    });

  } catch (error) {
    console.error('❌ Firestore updateDoc error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete document
router.post('/delete', async (req, res) => {
  try {
    const { collection, id } = req.body;
    
    console.log('🔍 Firestore deleteDoc:', { collection, id });

    if (!collection || !id) {
      return res.status(400).json({
        success: false,
        error: 'Collection and id are required'
      });
    }

    const docRef = db.collection(collection).doc(id);
    await docRef.delete();

    console.log(`✅ Document deleted with ID: ${id}`);

    res.json({
      success: true,
      id
    });

  } catch (error) {
    console.error('❌ Firestore deleteDoc error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch operations
router.post('/batch', async (req, res) => {
  try {
    const { operations } = req.body;
    
    console.log('🔍 Firestore batch:', { operationCount: operations.length });

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({
        success: false,
        error: 'Operations array is required'
      });
    }

    const batch = db.batch();

    for (const operation of operations) {
      const { type, collection, id, data, options = {} } = operation;
      const docRef = db.collection(collection).doc(id);

      switch (type) {
        case 'set':
          if (options.merge) {
            batch.set(docRef, data, { merge: true });
          } else {
            batch.set(docRef, data);
          }
          break;
        case 'update':
          batch.update(docRef, data);
          break;
        case 'delete':
          batch.delete(docRef);
          break;
        default:
          throw new Error(`Unknown batch operation type: ${type}`);
      }
    }

    await batch.commit();
    console.log(`✅ Batch completed: ${operations.length} operations`);

    res.json({
      success: true,
      operationCount: operations.length
    });

  } catch (error) {
    console.error('❌ Firestore batch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;