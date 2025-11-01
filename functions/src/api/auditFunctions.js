const express = require('express');
const router = express.Router();

const {
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
} = require('../services/auditService');
const { recordActivity } = require('../services/activityLogService');

const handleError = (res, error) => {
  const status =
    error.code === 'invalid-argument'
      ? 400
      : error.code === 'not-found'
      ? 404
      : error.code === 'permission-denied'
      ? 403
      : 500;

  return res.status(status).json({
    success: false,
    error: error.code || 'internal',
    message: error.message || 'An unexpected error occurred.',
    details: error.details,
  });
};

const logActivitySafe = async (payload = {}) => {
  try {
    await recordActivity(payload);
  } catch (error) {
    console.error('Failed to record audit activity log:', error);
  }
};

router.get('/dashboard', async (req, res) => {
  try {
    const companyId = req.query.companyId || null;
    const result = await getCompanySummary({ companyId });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/employees', async (req, res) => {
  try {
    const { companyId, department, orderBy } = req.query;
    const result = await listEmployees({ companyId: companyId || null, department: department || null, orderBy });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/employees/:employeeId/evaluations', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await listEmployeeEvaluations(employeeId);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/employees/:employeeId/evaluations', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const context = {
      userId: req.user?.uid || null,
      email: req.user?.email || null,
    };
    const result = await addEmployeeEvaluation(employeeId, req.body || {}, context);

     const evaluation = result?.evaluation || {};
     await logActivitySafe({
       module: 'audit',
       action: 'AUDIT_EVALUATION_CREATED',
       companyId: result.companyId,
       entityType: result.entityType,
       entityId: result.entityId,
       summary: `Evaluation recorded for employee ${employeeId}`,
       metadata: {
         evaluationId: evaluation.id || null,
         score: evaluation.score,
         rating: evaluation.rating,
         period: evaluation.period,
         department: result.department || null,
       },
       context: {
         user: req.user,
         request: req.activityContext,
       },
     });

    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/employees/:employeeId/incidents', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const result = await listEmployeeIncidents(employeeId);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/employees/:employeeId/incidents', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const context = {
      userId: req.user?.uid || null,
      email: req.user?.email || null,
    };
    const result = await addEmployeeIncident(employeeId, req.body || {}, context);

    const incident = result?.incident || {};
    await logActivitySafe({
      module: 'audit',
      action: 'AUDIT_INCIDENT_CREATED',
      companyId: result.companyId,
      entityType: result.entityType,
      entityId: result.entityId,
      summary: `Incident report created for employee ${employeeId}`,
      metadata: {
        incidentId: incident.id || null,
        severity: incident.severity,
        status: incident.status,
        occurredAt: incident.occurredAt,
        department: result.department || null,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/trainees', async (req, res) => {
  try {
    const { companyId, department, orderBy } = req.query;
    const result = await listTrainees({ companyId: companyId || null, department: department || null, orderBy });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/trainees/:traineeId/evaluations', async (req, res) => {
  try {
    const { traineeId } = req.params;
    const result = await listTraineeEvaluations(traineeId);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/trainees/:traineeId/evaluations', async (req, res) => {
  try {
    const { traineeId } = req.params;
    const context = {
      userId: req.user?.uid || null,
      email: req.user?.email || null,
    };
    const result = await addTraineeEvaluation(traineeId, req.body || {}, context);

    const evaluation = result?.evaluation || {};
    await logActivitySafe({
      module: 'audit',
      action: 'AUDIT_TRAINEE_EVALUATION_CREATED',
      companyId: result.companyId,
      entityType: result.entityType,
      entityId: result.entityId,
      summary: `Evaluation recorded for trainee ${traineeId}`,
      metadata: {
        evaluationId: evaluation.id || null,
        score: evaluation.score,
        rating: evaluation.rating,
        period: evaluation.period,
        department: result.department || null,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/trainees/:traineeId/incidents', async (req, res) => {
  try {
    const { traineeId } = req.params;
    const result = await listTraineeIncidents(traineeId);
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/trainees/:traineeId/incidents', async (req, res) => {
  try {
    const { traineeId } = req.params;
    const context = {
      userId: req.user?.uid || null,
      email: req.user?.email || null,
    };
    const result = await addTraineeIncident(traineeId, req.body || {}, context);

    const incident = result?.incident || {};
    await logActivitySafe({
      module: 'audit',
      action: 'AUDIT_TRAINEE_INCIDENT_CREATED',
      companyId: result.companyId,
      entityType: result.entityType,
      entityId: result.entityId,
      summary: `Incident report created for trainee ${traineeId}`,
      metadata: {
        incidentId: incident.id || null,
        severity: incident.severity,
        status: incident.status,
        occurredAt: incident.occurredAt,
        department: result.department || null,
      },
      context: {
        user: req.user,
        request: req.activityContext,
      },
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/incidents', async (req, res) => {
  try {
    const { companyId, status, limit } = req.query;
    const parsedLimit = Number(limit);
    const result = await listIncidentReports({
      companyId: companyId || null,
      status: status ? String(status).toLowerCase() : null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
