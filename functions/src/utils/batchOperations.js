/**
 * Batch Operations Utility - Phase 6.2 Performance Optimization
 * Firestore batch operations for bulk updates, deletes, and writes
 */

const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Batch write with automatic chunking
 * Firestore limits batches to 500 operations max
 * @param {Array<Object>} operations - Array of operations
 * @param {number} batchSize - Max operations per batch (default: 500)
 * @returns {Promise<Object>} Result with success count and timing
 */
exports.batchWrite = async (operations, batchSize = 500) => {
  const startTime = Date.now();

  if (!Array.isArray(operations) || operations.length === 0) {
    return {
      success: true,
      operationCount: 0,
      batchCount: 0,
      duration: 0,
      message: 'No operations to perform'
    };
  }

  try {
    let successCount = 0;
    let errorCount = 0;
    let batchCount = 0;

    // Process operations in chunks
    for (let i = 0; i < operations.length; i += batchSize) {
      const chunk = operations.slice(i, i + batchSize);
      const batch = db.batch();

      for (const operation of chunk) {
        try {
          switch (operation.type) {
            case 'set':
              batch.set(operation.ref, operation.data, operation.options || {});
              successCount++;
              break;

            case 'update':
              batch.update(operation.ref, operation.data);
              successCount++;
              break;

            case 'delete':
              batch.delete(operation.ref);
              successCount++;
              break;

            case 'merge':
              batch.set(operation.ref, operation.data, { merge: true });
              successCount++;
              break;

            default:
              console.warn(`Unknown operation type: ${operation.type}`);
              errorCount++;
          }
        } catch (error) {
          console.error(`Error processing operation:`, error);
          errorCount++;
        }
      }

      try {
        await batch.commit();
        batchCount++;
        console.log(`Batch ${batchCount} committed with ${chunk.length} operations`);
      } catch (error) {
        console.error(`Error committing batch ${batchCount}:`, error);
        throw error;
      }
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      operationCount: successCount,
      errorCount: errorCount,
      batchCount: batchCount,
      duration: duration,
      opsPerSecond: Math.round((successCount / duration) * 1000)
    };
  } catch (error) {
    console.error('Batch write error:', error);
    throw {
      code: 'batch-write-error',
      message: error.message || 'Batch write failed',
      duration: Date.now() - startTime
    };
  }
};

/**
 * Batch delete with filtering
 * Deletes documents matching criteria
 * @param {string} collectionPath - Collection path
 * @param {Array<Object>} constraints - Firestore query constraints
 * @param {number} batchSize - Max deletions per batch
 * @returns {Promise<Object>} Result with delete count
 */
exports.batchDelete = async (collectionPath, constraints = [], batchSize = 500) => {
  const startTime = Date.now();

  try {
    let deletedCount = 0;
    let totalBatches = 0;

    while (true) {
      let query = db.collection(collectionPath);

      // Apply constraints
      for (const constraint of constraints) {
        if (constraint.where) {
          const { field, operator, value } = constraint.where;
          query = query.where(field, operator, value);
        }
      }

      // Apply pagination
      query = query.limit(batchSize);

      const snapshot = await query.get();

      if (snapshot.empty) {
        break;
      }

      // Batch delete documents
      const batch = db.batch();

      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        deletedCount++;
      }

      await batch.commit();
      totalBatches++;

      console.log(`Batch ${totalBatches}: Deleted ${snapshot.docs.length} documents`);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      deletedCount: deletedCount,
      batchCount: totalBatches,
      duration: duration
    };
  } catch (error) {
    console.error('Batch delete error:', error);
    throw {
      code: 'batch-delete-error',
      message: error.message || 'Batch delete failed',
      duration: Date.now() - startTime
    };
  }
};

/**
 * Batch update with field transformers
 * Updates multiple documents with custom logic
 * @param {string} collectionPath - Collection path
 * @param {Function} updateFn - Function that returns update data for each doc
 * @param {Array<Object>} constraints - Query constraints
 * @param {number} batchSize - Max updates per batch
 * @returns {Promise<Object>} Result with update count
 */
exports.batchUpdate = async (collectionPath, updateFn, constraints = [], batchSize = 500) => {
  const startTime = Date.now();

  try {
    let updatedCount = 0;
    let totalBatches = 0;
    let errorCount = 0;

    let query = db.collection(collectionPath);

    // Apply constraints
    for (const constraint of constraints) {
      if (constraint.where) {
        const { field, operator, value } = constraint.where;
        query = query.where(field, operator, value);
      }
    }

    // Apply sorting if specified
    for (const constraint of constraints) {
      if (constraint.orderBy) {
        const { field, direction } = constraint.orderBy;
        query = query.orderBy(field, direction || 'asc');
      }
    }

    const allDocs = await query.get();
    const docs = allDocs.docs;

    // Process in batches
    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      const batch = db.batch();

      for (const doc of chunk) {
        try {
          const updateData = await updateFn(doc.data(), doc.id);
          if (updateData) {
            batch.update(doc.ref, updateData);
            updatedCount++;
          }
        } catch (error) {
          console.error(`Error processing document ${doc.id}:`, error);
          errorCount++;
        }
      }

      await batch.commit();
      totalBatches++;

      console.log(`Batch ${totalBatches}: Updated ${chunk.length} documents (${updatedCount} total)`);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      updatedCount: updatedCount,
      errorCount: errorCount,
      batchCount: totalBatches,
      duration: duration,
      docsPerSecond: Math.round((updatedCount / duration) * 1000)
    };
  } catch (error) {
    console.error('Batch update error:', error);
    throw {
      code: 'batch-update-error',
      message: error.message || 'Batch update failed',
      duration: Date.now() - startTime
    };
  }
};

/**
 * Bulk import with validation and batch processing
 * Imports array of objects into Firestore
 * @param {string} collectionPath - Collection path
 * @param {Array<Object>} data - Data to import
 * @param {Function} validateFn - Validation function
 * @param {Function} transformFn - Transform function before writing
 * @param {number} batchSize - Max inserts per batch
 * @returns {Promise<Object>} Import result with statistics
 */
exports.bulkImport = async (collectionPath, data, validateFn, transformFn, batchSize = 500) => {
  const startTime = Date.now();

  if (!Array.isArray(data) || data.length === 0) {
    return {
      success: true,
      importedCount: 0,
      rejectedCount: 0,
      duration: 0
    };
  }

  try {
    let importedCount = 0;
    let rejectedCount = 0;
    let totalBatches = 0;
    const errors = [];

    // Validate all items first
    const validItems = [];
    for (let i = 0; i < data.length; i++) {
      try {
        const item = data[i];

        // Validate
        if (validateFn) {
          const validationResult = await validateFn(item, i);
          if (!validationResult.valid) {
            errors.push({
              index: i,
              error: validationResult.error,
              item: item
            });
            rejectedCount++;
            continue;
          }
        }

        // Transform
        const transformedItem = transformFn ? await transformFn(item) : item;
        validItems.push(transformedItem);
      } catch (error) {
        console.error(`Error processing item ${i}:`, error);
        errors.push({
          index: i,
          error: error.message,
          item: data[i]
        });
        rejectedCount++;
      }
    }

    // Import in batches
    for (let i = 0; i < validItems.length; i += batchSize) {
      const chunk = validItems.slice(i, i + batchSize);
      const batch = db.batch();
      const ref = db.collection(collectionPath);

      for (const item of chunk) {
        const docRef = ref.doc(); // Auto-generate ID
        batch.set(docRef, {
          ...item,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          importedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
      importedCount += chunk.length;
      totalBatches++;

      console.log(`Batch ${totalBatches}: Imported ${chunk.length} items (${importedCount} total)`);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      importedCount: importedCount,
      rejectedCount: rejectedCount,
      errorCount: errors.length,
      batchCount: totalBatches,
      duration: duration,
      itemsPerSecond: Math.round((importedCount / duration) * 1000),
      errors: errors.length > 0 ? errors.slice(0, 10) : [] // Return first 10 errors
    };
  } catch (error) {
    console.error('Bulk import error:', error);
    throw {
      code: 'bulk-import-error',
      message: error.message || 'Bulk import failed',
      duration: Date.now() - startTime
    };
  }
};

/**
 * Atomic transaction for complex multi-document operations
 * @param {Function} transactionFn - Function containing transaction logic
 * @returns {Promise<any>} Transaction result
 */
exports.atomicTransaction = async (transactionFn) => {
  const startTime = Date.now();

  try {
    const result = await db.runTransaction(async (transaction) => {
      return await transactionFn(transaction);
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      result: result,
      duration: duration
    };
  } catch (error) {
    console.error('Transaction error:', error);
    throw {
      code: 'transaction-error',
      message: error.message || 'Transaction failed',
      duration: Date.now() - startTime
    };
  }
};

/**
 * Performance metrics for batch operations
 * @param {number} operationCount - Number of operations
 * @param {number} duration - Duration in milliseconds
 * @returns {Object} Performance metrics
 */
exports.calculateMetrics = (operationCount, duration) => {
  if (duration === 0) {
    return {
      opsPerSecond: 0,
      avgTimePerOp: 0,
      duration: duration
    };
  }

  return {
    operationCount: operationCount,
    duration: duration,
    opsPerSecond: Math.round((operationCount / duration) * 1000),
    avgTimePerOp: Math.round((duration / operationCount) * 100) / 100,
    estimatedFor1000Ops: Math.round((1000 / operationCount) * duration)
  };
};

module.exports = exports;
