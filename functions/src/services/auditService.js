const admin = require('../utils/firebaseAdmin');

const firestore = () => {
  if (typeof admin.firestore !== 'function') {
    throw new Error('Firestore is not initialized');
  }
  return admin.firestore();
};

const FieldValue = admin.firestore.FieldValue;

const EMPLOYEE_COLLECTION = 'employees';
const TRAINEE_COLLECTION = 'trainingRecords';

const createServiceError = (code, message, details) => {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const safeString = (value) => (value === null || value === undefined ? '' : String(value).trim());

const safeNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) {
    return null;
  }
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toISOString();
  }
  return null;
};

const buildEvaluationRecord = (data = {}, context = {}) => {
  const score = safeNumber(data.score);
  const average = safeNumber(data.average);
  const performance = safeNumber(data.performance);
  const productivity = safeNumber(data.productivity);
  const teamwork = safeNumber(data.teamwork);
  const initiative = safeNumber(data.initiative);
  const rating = safeString(data.rating || data.category);
  const period = safeString(data.period);

  if (score === null && average === null && !rating && !safeString(data.notes) && !safeString(data.comments)) {
    throw createServiceError('invalid-argument', 'Evaluation must include at least a score, average, rating, period, notes, or comments.');
  }

  return {
    score,
    average,
    performance,
    productivity,
    teamwork,
    initiative,
    strengths: safeString(data.strengths) || null,
    improvements: safeString(data.improvements) || null,
    comments: safeString(data.comments) || null,
    rating: rating || null,
    category: safeString(data.category) || null,
    period: period || null,
    notes: safeString(data.notes) || null,
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => safeString(tag)).filter(Boolean) : [],
    evaluatedAt: data.evaluatedAt ? new Date(data.evaluatedAt) : FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    createdBy: context.userId || null,
    createdByEmail: context.email || null,
  };
};

const buildIncidentRecord = (data = {}, context = {}) => {
  const title = safeString(data.title);
  const description = safeString(data.description);

  if (!title) {
    throw createServiceError('invalid-argument', 'Incident report title is required.');
  }

  if (!description) {
    throw createServiceError('invalid-argument', 'Incident report description is required.');
  }

  const severity = safeString(data.severity || 'medium').toLowerCase();
  const allowedSeverities = new Set(['low', 'medium', 'high', 'critical']);
  const normalizedSeverity = allowedSeverities.has(severity) ? severity : 'medium';

  const status = safeString(data.status || 'open').toLowerCase();
  const allowedStatuses = new Set(['open', 'in-review', 'closed', 'resolved']);
  const normalizedStatus = allowedStatuses.has(status) ? status : 'open';

  return {
    title,
    description,
    severity: normalizedSeverity,
    status: normalizedStatus,
    occurredAt: data.occurredAt ? new Date(data.occurredAt) : null,
    followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
    resolution: safeString(data.resolution) || null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: context.userId || null,
    createdByEmail: context.email || null,
    lastUpdatedAt: FieldValue.serverTimestamp(),
    lastUpdatedBy: context.userId || null,
  };
};

const attachEntityMetadata = (record = {}, meta = {}) => ({
  ...record,
  companyId: meta.companyId || null,
  entityId: meta.entityId || null,
  entityType: meta.entityType || null,
  entityDepartment: meta.department || null,
});

const readCollectionDocs = (snapshot) =>
  snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

const normalizeEvaluationDoc = (doc) => {
  return {
    id: doc.id,
    score: safeNumber(doc.score),
    average: safeNumber(doc.average),
    performance: safeNumber(doc.performance),
    productivity: safeNumber(doc.productivity),
    teamwork: safeNumber(doc.teamwork),
    initiative: safeNumber(doc.initiative),
    strengths: doc.strengths || null,
    improvements: doc.improvements || null,
    comments: doc.comments || null,
    rating: doc.rating || null,
    category: doc.category || null,
    period: doc.period || null,
    notes: doc.notes || null,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    evaluatedAt: formatTimestamp(doc.evaluatedAt) || formatTimestamp(doc.createdAt),
    createdAt: formatTimestamp(doc.createdAt),
    createdBy: doc.createdBy || null,
    createdByEmail: doc.createdByEmail || null,
  };
};

const normalizeIncidentDoc = (doc) => ({
  id: doc.id,
  title: doc.title,
  description: doc.description,
  severity: doc.severity || 'medium',
  status: doc.status || 'open',
  occurredAt: formatTimestamp(doc.occurredAt),
  followUpAt: formatTimestamp(doc.followUpAt),
  resolution: doc.resolution || null,
  createdAt: formatTimestamp(doc.createdAt),
  createdBy: doc.createdBy || null,
  createdByEmail: doc.createdByEmail || null,
  lastUpdatedAt: formatTimestamp(doc.lastUpdatedAt),
  lastUpdatedBy: doc.lastUpdatedBy || null,
});

const getCompanySummary = async ({ companyId }) => {
  try {
    const db = firestore();

    let employeeQuery = db.collection(EMPLOYEE_COLLECTION);
    if (companyId) {
      employeeQuery = employeeQuery.where('companyId', '==', companyId);
    }
    const employeeSnapshot = await employeeQuery.get();

    let traineeQuery = db.collection(TRAINEE_COLLECTION);
    if (companyId) {
      traineeQuery = traineeQuery.where('companyId', '==', companyId);
    }
    const traineeSnapshot = await traineeQuery.get();

    const departmentMap = new Map();
    let totalEvaluations = 0;
    let totalIncidents = 0;
    let openIncidents = 0;

    const employeeAggregation = employeeSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      const department = safeString(data.department || data.departmentName || 'Unassigned');
      departmentMap.set(department, (departmentMap.get(department) || 0) + 1);

      const evalCountSnap = await doc.ref.collection('evaluations').count().get();
      const incidentSnapshot = await doc.ref.collection('incidentReports').get();

      totalEvaluations += evalCountSnap.data().count;
      totalIncidents += incidentSnapshot.size;
      incidentSnapshot.forEach((incidentDoc) => {
        const status = safeString(incidentDoc.data().status).toLowerCase();
        if (status !== 'closed' && status !== 'resolved') {
          openIncidents += 1;
        }
      });
    });

    const traineeAggregation = traineeSnapshot.docs.map(async (doc) => {
      const evalCountSnap = await doc.ref.collection('evaluations').count().get();
      const incidentSnapshot = await doc.ref.collection('incidentReports').get();

      totalEvaluations += evalCountSnap.data().count;
      totalIncidents += incidentSnapshot.size;
      incidentSnapshot.forEach((incidentDoc) => {
        const status = safeString(incidentDoc.data().status).toLowerCase();
        if (status !== 'closed' && status !== 'resolved') {
          openIncidents += 1;
        }
      });
    });

    await Promise.all([...employeeAggregation, ...traineeAggregation]);

    const topDepartments = Array.from(departmentMap.entries())
      .map(([name, count]) => ({ department: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      success: true,
      summary: {
        totalEmployees: employeeSnapshot.size,
        totalTrainees: traineeSnapshot.size,
        totalEvaluations,
        totalIncidents,
        openIncidents,
        topDepartments,
      },
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to compute audit summary: ${error.message}`);
  }
};

const listEmployees = async ({ companyId, department, orderBy = 'employeeName' }) => {
  try {
    const db = firestore();
    let query = db.collection(EMPLOYEE_COLLECTION);

    console.log('📊 [listEmployees] Query params:', { companyId, department, orderBy });

    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }
    if (department) {
      query = query.where('department', '==', department);
    }

    const allowedOrderFields = new Set(['employeeName', 'department', 'lastName', 'firstName']);
    const orderField = allowedOrderFields.has(orderBy) ? orderBy : 'employeeName';
    const snapshot = await query.orderBy(orderField, 'asc').get();

    console.log('📊 [listEmployees] Found', snapshot.size, 'employees');

    const employees = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const [evaluationsSnapshot, incidentsSnapshot] = await Promise.all([
          doc.ref.collection('evaluations').get(),
          doc.ref.collection('incidentReports').get(),
        ]);

        const evaluationCount = evaluationsSnapshot.size;
        let averageScore = null;
        let latestEvaluationDoc = null;
        let latestEvaluationTime = -Infinity;
        let scoreAccumulator = 0;
        let scoredCount = 0;

        evaluationsSnapshot.forEach((evaluationDoc) => {
          const evaluationData = evaluationDoc.data();
          const evaluationScore = safeNumber(evaluationData.average) ?? safeNumber(evaluationData.score);
          if (evaluationScore !== null) {
            scoreAccumulator += evaluationScore;
            scoredCount += 1;
          }

          const evaluationTime = evaluationData.evaluatedAt
            ? new Date(formatTimestamp(evaluationData.evaluatedAt)).getTime()
            : evaluationData.createdAt
            ? new Date(formatTimestamp(evaluationData.createdAt)).getTime()
            : null;

          if (Number.isFinite(evaluationTime) && evaluationTime > latestEvaluationTime) {
            latestEvaluationTime = evaluationTime;
            latestEvaluationDoc = {
              id: evaluationDoc.id,
              ...evaluationData,
            };
          }
        });

        if (scoredCount > 0) {
          averageScore = scoreAccumulator / scoredCount;
        }

        const latestEvaluation = latestEvaluationDoc
          ? normalizeEvaluationDoc(latestEvaluationDoc)
          : null;

        const incidentCount = incidentsSnapshot.size;
        const openIncidents = incidentsSnapshot.docs.filter((incidentDoc) => {
          const status = safeString(incidentDoc.data().status).toLowerCase();
          return status !== 'closed' && status !== 'resolved';
        }).length;

        return {
          id: doc.id,
          ...data,
          audit: {
            evaluationCount,
            incidentCount,
            openIncidents,
            averageScore,
            latestEvaluation,
          },
        };
      })
    );

    return {
      success: true,
      employees,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to list employees for audit: ${error.message}`);
  }
};

const listTrainees = async ({ companyId, department, orderBy = 'employeeName' }) => {
  try {
    const db = firestore();
    let query = db.collection(TRAINEE_COLLECTION);

    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }
    if (department) {
      query = query.where('department', '==', department);
    }

    const allowedOrderFields = new Set(['employeeName', 'department', 'lastName', 'firstName']);
    const orderField = allowedOrderFields.has(orderBy) ? orderBy : 'employeeName';
    const snapshot = await query.orderBy(orderField, 'asc').get();

    const trainees = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const [evaluationsSnapshot, incidentsSnapshot] = await Promise.all([
          doc.ref.collection('evaluations').get(),
          doc.ref.collection('incidentReports').get(),
        ]);

        const evaluationCount = evaluationsSnapshot.size;
        let averageScore = null;
        let latestEvaluationDoc = null;
        let latestEvaluationTime = -Infinity;
        let scoreAccumulator = 0;
        let scoredCount = 0;

        evaluationsSnapshot.forEach((evaluationDoc) => {
          const evaluationData = evaluationDoc.data();
          
          const evaluationScore = safeNumber(evaluationData.average) ?? safeNumber(evaluationData.score);
          if (evaluationScore !== null) {
            scoreAccumulator += evaluationScore;
            scoredCount += 1;
          }

          const evaluationTime = evaluationData.evaluatedAt
            ? new Date(formatTimestamp(evaluationData.evaluatedAt)).getTime()
            : evaluationData.createdAt
            ? new Date(formatTimestamp(evaluationData.createdAt)).getTime()
            : null;

          if (Number.isFinite(evaluationTime) && evaluationTime > latestEvaluationTime) {
            latestEvaluationTime = evaluationTime;
            latestEvaluationDoc = {
              id: evaluationDoc.id,
              ...evaluationData,
            };
          }
        });

        if (scoredCount > 0) {
          averageScore = scoreAccumulator / scoredCount;
        }

        const incidentCount = incidentsSnapshot.size;
        const openIncidents = incidentsSnapshot.docs.filter((incidentDoc) => {
          const status = safeString(incidentDoc.data().status).toLowerCase();
          return status !== 'closed' && status !== 'resolved';
        }).length;

        const latestEvaluation = latestEvaluationDoc
          ? normalizeEvaluationDoc(latestEvaluationDoc)
          : null;

        return {
          id: doc.id,
          ...data,
          audit: {
            evaluationCount,
            incidentCount,
            openIncidents,
            averageScore,
            latestEvaluation,
          },
        };
      })
    );

    return {
      success: true,
      trainees,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to list trainees for audit: ${error.message}`);
  }
};

const ensureEmployee = async (employeeId) => {
  const db = firestore();
  const docRef = db.collection(EMPLOYEE_COLLECTION).doc(safeString(employeeId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw createServiceError('not-found', 'Employee record not found.');
  }
  return { ref: docRef, data: snapshot.data() };
};

const ensureTrainee = async (traineeId) => {
  const db = firestore();
  const docRef = db.collection(TRAINEE_COLLECTION).doc(safeString(traineeId));
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw createServiceError('not-found', 'Trainee record not found.');
  }
  return { ref: docRef, data: snapshot.data() };
};

const addEmployeeEvaluation = async (employeeId, payload = {}, context = {}) => {
  const { ref, data } = await ensureEmployee(employeeId);
  const evaluationRecord = attachEntityMetadata(
    buildEvaluationRecord(payload, context),
    {
      entityId: ref.id,
      entityType: 'employee',
      companyId: data.companyId || null,
      department: data.department || null,
    }
  );
  const docRef = await ref.collection('evaluations').add(evaluationRecord);
  const snapshot = await docRef.get();
  return {
    success: true,
    evaluation: normalizeEvaluationDoc({
      id: snapshot.id,
      ...snapshot.data(),
    }),
    companyId: data.companyId || null,
    entityId: ref.id,
    entityType: 'employee',
    department: data.department || null,
  };
};

const listEmployeeEvaluations = async (employeeId) => {
  const { ref } = await ensureEmployee(employeeId);
  const snapshot = await ref.collection('evaluations').orderBy('evaluatedAt', 'desc').get();
  return {
    success: true,
    evaluations: readCollectionDocs(snapshot).map(normalizeEvaluationDoc),
  };
};

const addEmployeeIncident = async (employeeId, payload = {}, context = {}) => {
  const { ref, data } = await ensureEmployee(employeeId);
  const incidentRecord = attachEntityMetadata(
    buildIncidentRecord(payload, context),
    {
      entityId: ref.id,
      entityType: 'employee',
      companyId: data.companyId || null,
      department: data.department || null,
    }
  );
  const docRef = await ref.collection('incidentReports').add(incidentRecord);
  const snapshot = await docRef.get();
  return {
    success: true,
    incident: normalizeIncidentDoc({
      id: snapshot.id,
      ...snapshot.data(),
    }),
    companyId: data.companyId || null,
    entityId: ref.id,
    entityType: 'employee',
    department: data.department || null,
  };
};

const listEmployeeIncidents = async (employeeId) => {
  const { ref } = await ensureEmployee(employeeId);
  const snapshot = await ref.collection('incidentReports').orderBy('createdAt', 'desc').get();
  return {
    success: true,
    incidents: readCollectionDocs(snapshot).map(normalizeIncidentDoc),
  };
};

const addTraineeEvaluation = async (traineeId, payload = {}, context = {}) => {
  const { ref, data } = await ensureTrainee(traineeId);
  const evaluationRecord = attachEntityMetadata(
    buildEvaluationRecord(payload, context),
    {
      entityId: ref.id,
      entityType: 'trainee',
      companyId: data.companyId || null,
      department: data.department || null,
    }
  );
  const docRef = await ref.collection('evaluations').add(evaluationRecord);
  const snapshot = await docRef.get();
  return {
    success: true,
    evaluation: normalizeEvaluationDoc({
      id: snapshot.id,
      ...snapshot.data(),
    }),
    companyId: data.companyId || null,
    entityId: ref.id,
    entityType: 'trainee',
    department: data.department || null,
  };
};

const listTraineeEvaluations = async (traineeId) => {
  const { ref } = await ensureTrainee(traineeId);
  const snapshot = await ref.collection('evaluations').orderBy('evaluatedAt', 'desc').get();
  return {
    success: true,
    evaluations: readCollectionDocs(snapshot).map(normalizeEvaluationDoc),
  };
};

const addTraineeIncident = async (traineeId, payload = {}, context = {}) => {
  const { ref, data } = await ensureTrainee(traineeId);
  const incidentRecord = attachEntityMetadata(
    buildIncidentRecord(payload, context),
    {
      entityId: ref.id,
      entityType: 'trainee',
      companyId: data.companyId || null,
      department: data.department || null,
    }
  );
  const docRef = await ref.collection('incidentReports').add(incidentRecord);
  const snapshot = await docRef.get();
  return {
    success: true,
    incident: normalizeIncidentDoc({
      id: snapshot.id,
      ...snapshot.data(),
    }),
    companyId: data.companyId || null,
    entityId: ref.id,
    entityType: 'trainee',
    department: data.department || null,
  };
};

const listTraineeIncidents = async (traineeId) => {
  const { ref } = await ensureTrainee(traineeId);
  const snapshot = await ref.collection('incidentReports').orderBy('createdAt', 'desc').get();
  return {
    success: true,
    incidents: readCollectionDocs(snapshot).map(normalizeIncidentDoc),
  };
};

const listIncidentReports = async ({ companyId, status, limit = 200 }) => {
  try {
    const db = firestore();
    let query = db.collectionGroup('incidentReports');

    // Only apply companyId filter at query level to avoid needing composite index
    if (companyId) {
      query = query.where('companyId', '==', companyId);
    }

    // Order by createdAt - this works with single where clause
    query = query.orderBy('createdAt', 'desc').limit(Math.min(limit, 500));

    const snapshot = await query.get();

    let incidents = snapshot.docs.map((doc) => {
      const data = doc.data();
      const normalized = normalizeIncidentDoc({ id: doc.id, ...data });
      return {
        ...normalized,
        entityType: data.entityType || 'employee',
        entityId: data.entityId || doc.ref.parent.parent?.id || null,
        companyId: data.companyId || null,
        entityDepartment: data.entityDepartment || null,
      };
    });

    // Filter by status in memory to avoid composite index requirement
    if (status && status !== 'all') {
      incidents = incidents.filter(incident => incident.status === status);
    }

    return {
      success: true,
      incidents,
    };
  } catch (error) {
    if (error.code) {
      throw error;
    }
    throw createServiceError('internal', `Failed to list incident reports: ${error.message}`);
  }
};

module.exports = {
  getCompanySummary,
  listEmployees,
  listTrainees,
  addEmployeeEvaluation,
  listEmployeeEvaluations,
  addEmployeeIncident,
  listEmployeeIncidents,
  addTraineeEvaluation,
  listTraineeEvaluations,
  addTraineeIncident,
  listTraineeIncidents,
  listIncidentReports,
};
