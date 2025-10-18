/**
 * Cloud Tasks Queue Utility - Phase 6.2 Performance Optimization
 * Manages long-running operations (bulk payroll for 500+ employees)
 */

const admin = require('firebase-admin');
const db = admin.firestore();

// Cloud Tasks client setup
let tasksClient = null;

/**
 * Initialize Cloud Tasks client
 */
const getTasksClient = async () => {
  if (!tasksClient) {
    try {
      const cloudTasks = require('@google-cloud/tasks');
      tasksClient = new cloudTasks.CloudTasksClient();
    } catch (error) {
      console.warn('Cloud Tasks client not available:', error.message);
      return null;
    }
  }
  return tasksClient;
};

/**
 * Queue a bulk payroll operation
 * @param {Object} taskData - Task payload
 * @returns {Promise<Object>} Task creation result
 */
exports.queueBulkPayroll = async (taskData) => {
  try {
    const client = await getTasksClient();

    if (!client) {
      throw new Error('Cloud Tasks client not available');
    }

    const {
      companyId,
      employeeIds,
      month,
      options = {}
    } = taskData;

    // Validate input
    if (!companyId || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      throw new Error('Invalid task data: companyId and employeeIds are required');
    }

    // Get project and queue info
    const projectId = process.env.GCP_PROJECT || admin.app().options.projectId;
    const queueName = 'bulk-payroll-queue';
    const region = 'us-central1';

    const parent = client.queuePath(projectId, region, queueName);

    // Create task
    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://us-central1-${projectId}.cloudfunctions.net/processBulkPayroll`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({
          companyId,
          employeeIds,
          month,
          options,
          taskId: `payroll-${companyId}-${month}-${Date.now()}`
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + (options.delaySeconds || 0),
      },
    };

    // Send task to queue
    const [response] = await client.createTask({ parent, task });

    console.log(`Queued bulk payroll task: ${response.name}`);

    // Store task info in Firestore
    await db.collection('task_queue').add({
      type: 'bulk_payroll',
      companyId: companyId,
      employeeCount: employeeIds.length,
      month: month,
      taskName: response.name,
      status: 'queued',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      estimatedDuration: Math.ceil(employeeIds.length / 100) * 30 // 30s per 100 employees
    });

    return {
      success: true,
      taskName: response.name,
      employeeCount: employeeIds.length,
      message: `Bulk payroll queued for ${employeeIds.length} employees`
    };
  } catch (error) {
    console.error('Error queueing bulk payroll task:', error);
    throw {
      code: 'queue-error',
      message: error.message || 'Failed to queue task',
      taskType: 'bulk_payroll'
    };
  }
};

/**
 * Queue a bulk import operation
 * @param {Object} taskData - Task payload
 * @returns {Promise<Object>} Task creation result
 */
exports.queueBulkImport = async (taskData) => {
  try {
    const client = await getTasksClient();

    if (!client) {
      throw new Error('Cloud Tasks client not available');
    }

    const {
      companyId,
      collectionName,
      dataUrl,
      options = {}
    } = taskData;

    if (!companyId || !collectionName || !dataUrl) {
      throw new Error('Invalid task data: companyId, collectionName, and dataUrl are required');
    }

    const projectId = process.env.GCP_PROJECT || admin.app().options.projectId;
    const queueName = 'bulk-import-queue';
    const region = 'us-central1';

    const parent = client.queuePath(projectId, region, queueName);

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://us-central1-${projectId}.cloudfunctions.net/processBulkImport`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({
          companyId,
          collectionName,
          dataUrl,
          options,
          taskId: `import-${companyId}-${collectionName}-${Date.now()}`
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + (options.delaySeconds || 0),
      },
    };

    const [response] = await client.createTask({ parent, task });

    console.log(`Queued bulk import task: ${response.name}`);

    // Store task info
    await db.collection('task_queue').add({
      type: 'bulk_import',
      companyId: companyId,
      collection: collectionName,
      dataUrl: dataUrl,
      taskName: response.name,
      status: 'queued',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      taskName: response.name,
      collection: collectionName,
      message: `Bulk import queued for ${collectionName}`
    };
  } catch (error) {
    console.error('Error queueing bulk import task:', error);
    throw {
      code: 'queue-error',
      message: error.message || 'Failed to queue task',
      taskType: 'bulk_import'
    };
  }
};

/**
 * Queue report generation
 * @param {Object} taskData - Task payload
 * @returns {Promise<Object>} Task creation result
 */
exports.queueReportGeneration = async (taskData) => {
  try {
    const client = await getTasksClient();

    if (!client) {
      throw new Error('Cloud Tasks client not available');
    }

    const {
      companyId,
      reportType,
      startDate,
      endDate,
      userId,
      options = {}
    } = taskData;

    if (!companyId || !reportType) {
      throw new Error('Invalid task data: companyId and reportType are required');
    }

    const projectId = process.env.GCP_PROJECT || admin.app().options.projectId;
    const queueName = 'report-generation-queue';
    const region = 'us-central1';

    const parent = client.queuePath(projectId, region, queueName);

    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `https://us-central1-${projectId}.cloudfunctions.net/generateReport`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({
          companyId,
          reportType,
          startDate,
          endDate,
          userId,
          options,
          taskId: `report-${companyId}-${reportType}-${Date.now()}`
        })).toString('base64'),
      },
      scheduleTime: {
        seconds: Math.floor(Date.now() / 1000) + (options.delaySeconds || 0),
      },
    };

    const [response] = await client.createTask({ parent, task });

    console.log(`Queued report generation task: ${response.name}`);

    // Store task info
    await db.collection('task_queue').add({
      type: 'report_generation',
      companyId: companyId,
      reportType: reportType,
      startDate: startDate,
      endDate: endDate,
      userId: userId,
      taskName: response.name,
      status: 'queued',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      taskName: response.name,
      reportType: reportType,
      message: `Report generation queued for ${reportType}`
    };
  } catch (error) {
    console.error('Error queueing report task:', error);
    throw {
      code: 'queue-error',
      message: error.message || 'Failed to queue task',
      taskType: 'report_generation'
    };
  }
};

/**
 * Get task status
 * @param {string} taskName - Full task name from Cloud Tasks
 * @returns {Promise<Object>} Task status
 */
exports.getTaskStatus = async (taskName) => {
  try {
    const client = await getTasksClient();

    if (!client) {
      throw new Error('Cloud Tasks client not available');
    }

    const [task] = await client.getTask({ name: taskName });

    return {
      name: task.name,
      state: task.state,
      scheduleTime: task.scheduleTime,
      createTime: task.createTime,
      dispatchDeadline: task.dispatchDeadline,
      httpRequest: {
        uri: task.httpRequest?.uri,
        httpMethod: task.httpRequest?.httpMethod
      }
    };
  } catch (error) {
    console.error('Error getting task status:', error);
    throw {
      code: 'task-status-error',
      message: error.message || 'Failed to get task status'
    };
  }
};

/**
 * List pending tasks
 * @param {string} companyId - Company ID (optional)
 * @returns {Promise<Array>} List of pending tasks
 */
exports.listPendingTasks = async (companyId = null) => {
  try {
    let query = db.collection('task_queue').where('status', '==', 'queued');

    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }

    query = query.orderBy('createdAt', 'desc').limit(100);

    const snapshot = await query.get();

    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      total: tasks.length,
      tasks: tasks
    };
  } catch (error) {
    console.error('Error listing pending tasks:', error);
    throw {
      code: 'list-tasks-error',
      message: error.message || 'Failed to list tasks'
    };
  }
};

/**
 * Update task status
 * @param {string} taskId - Firestore task ID
 * @param {string} status - New status (queued, processing, completed, failed)
 * @param {Object} result - Operation result (optional)
 */
exports.updateTaskStatus = async (taskId, status, result = null) => {
  try {
    const updateData = {
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (status === 'completed') {
      updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (status === 'failed') {
      updateData.failedAt = admin.firestore.FieldValue.serverTimestamp();
      updateData.error = result?.error;
    }

    if (result) {
      updateData.result = result;
    }

    await db.collection('task_queue').doc(taskId).update(updateData);

    console.log(`Updated task ${taskId} status to ${status}`);

    return {
      success: true,
      taskId: taskId,
      status: status
    };
  } catch (error) {
    console.error('Error updating task status:', error);
    throw {
      code: 'update-status-error',
      message: error.message || 'Failed to update task status'
    };
  }
};

/**
 * Estimate task processing time
 * @param {string} taskType - Type of task (bulk_payroll, bulk_import, etc.)
 * @param {number} itemCount - Number of items to process
 * @returns {Object} Time estimates
 */
exports.estimateProcessingTime = (taskType, itemCount) => {
  const estimates = {
    bulk_payroll: 30, // 30ms per employee
    bulk_import: 50,  // 50ms per record
    report_generation: 100, // 100ms per report
    default: 100
  };

  const msPerItem = estimates[taskType] || estimates.default;
  const totalMs = itemCount * msPerItem;

  return {
    taskType: taskType,
    itemCount: itemCount,
    estimatedDurationMs: totalMs,
    estimatedDurationSeconds: Math.ceil(totalMs / 1000),
    estimatedDurationMinutes: Math.ceil(totalMs / 60000),
    itemsPerSecond: Math.round(1000 / msPerItem)
  };
};

module.exports = exports;
