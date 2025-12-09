const express = require('express');
const router = express.Router();
const evaluationService = require('../services/evaluationService');
const { requireAuthenticatedUser } = require('../middleware/requestContext');

// Middleware to ensure tenantId is present and authorized
const requireTenant = (req, res, next) => {
    // Check path param first (restful), then context
    const tenantId = req.params.tenantId || req.tenantId;
    
    if (!tenantId) {
        return res.status(400).json({ success: false, error: 'Tenant ID is required' });
    }
    
    // Security check: Ensure the user belongs to this tenant
    // req.user.token.companyId is the user's home tenant.
    if (req.user?.token?.companyId !== tenantId && req.user?.specialrole !== 'superadmin') {
         // Allow if user is authorized auditor for this tenant (future expansion)
         // For now, strict check based on user's companyId
         return res.status(403).json({ success: false, error: 'Access denied to this tenant' });
    }

    req.currentTenantId = tenantId;
    next();
};

// GET evaluations
router.get('/tenants/:tenantId/employees/:employeeId/evaluations', requireAuthenticatedUser, requireTenant, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const evaluations = await evaluationService.getEvaluationsForEmployee(req.currentTenantId, employeeId);
    res.json({ success: true, data: evaluations });
  } catch (error) {
    console.error('Get evaluations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT (Upsert) evaluation
router.put('/tenants/:tenantId/employees/:employeeId/evaluations', requireAuthenticatedUser, requireTenant, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const payload = req.body;
    const result = await evaluationService.upsertEvaluation(req.currentTenantId, employeeId, payload, req.user);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Upsert evaluation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
