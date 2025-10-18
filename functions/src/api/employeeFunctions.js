const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const rateLimitMiddleware = require('../middleware/rateLimitMiddleware');
const employeeService = require('../services/employeeService');

const router = express.Router();

router.use(authMiddleware);
router.use(rateLimitMiddleware);

function resolveCompanyId(req) {
  return req.headers['x-company-id'] || req.query.companyId || req.body?.companyId;
}

router.get('/', async (req, res) => {
  const companyId = resolveCompanyId(req);

  if (!companyId) {
    res.status(400).json({ message: 'companyId required' });
    return;
  }

  try {
    const employees = await employeeService.listEmployees(companyId);
    res.json(employees);
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

router.get('/:employeeId', async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { employeeId } = req.params;

  if (!companyId) {
    res.status(400).json({ message: 'companyId required' });
    return;
  }

  try {
    const employee = await employeeService.getEmployeeById(companyId, employeeId);
    res.json(employee);
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  const companyId = resolveCompanyId(req);

  if (!companyId) {
    res.status(400).json({ message: 'companyId required' });
    return;
  }

  try {
    const employee = await employeeService.saveEmployee(companyId, req.body);
    res.status(201).json(employee);
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

router.patch('/:employeeId', async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { employeeId } = req.params;

  if (!companyId) {
    res.status(400).json({ message: 'companyId required' });
    return;
  }

  try {
    const employee = await employeeService.updateEmployee(companyId, employeeId, req.body);
    res.json(employee);
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

router.delete('/:employeeId', async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { employeeId } = req.params;

  if (!companyId) {
    res.status(400).json({ message: 'companyId required' });
    return;
  }

  try {
    await employeeService.archiveEmployee(companyId, employeeId);
    res.status(204).send();
  } catch (error) {
    res.status(501).json({ message: error.message });
  }
});

module.exports = router;
