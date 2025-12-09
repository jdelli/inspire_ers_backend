const { getEvaluationsForEmployee, upsertEvaluation } = require('./src/services/evaluationService');
const { getDbForTenant } = require('./src/utils/firebaseFactory');

// Mock dependencies
jest.mock('./src/utils/firebaseFactory');

describe('Evaluation Service', () => {
  const mockDb = {
    collection: jest.fn(),
  };
  const mockCollection = {
    where: jest.fn(),
    orderBy: jest.fn(),
    doc: jest.fn(),
    add: jest.fn(),
  };
  const mockQuery = {
    get: jest.fn(),
  };
  const mockDoc = {
    set: jest.fn(),
  };

  beforeEach(() => {
    getDbForTenant.mockResolvedValue(mockDb);
    mockDb.collection.mockReturnValue(mockCollection);
    mockCollection.where.mockReturnValue(mockCollection);
    mockCollection.orderBy.mockReturnValue(mockQuery);
    mockCollection.doc.mockReturnValue(mockDoc);
    mockCollection.add.mockResolvedValue({ id: 'new-id' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getEvaluationsForEmployee queries correct collection', async () => {
    const tenantId = 'tenant1';
    const employeeId = 'emp123';
    
    mockQuery.get.mockResolvedValue({
      docs: [
        { id: 'eval1', data: () => ({ rating: 'Excellent' }) }
      ]
    });

    const result = await getEvaluationsForEmployee(tenantId, employeeId);

    expect(getDbForTenant).toHaveBeenCalledWith(tenantId, 'evaluation');
    expect(mockDb.collection).toHaveBeenCalledWith('evaluations');
    expect(mockCollection.where).toHaveBeenCalledWith('employeeId', '==', employeeId);
    expect(result).toHaveLength(1);
    expect(result[0].rating).toBe('Excellent');
  });

  test('upsertEvaluation adds new document if no ID', async () => {
    const tenantId = 'tenant1';
    const employeeId = 'emp123';
    const payload = { rating: 'Good' };
    const userContext = { uid: 'user1' };

    const result = await upsertEvaluation(tenantId, employeeId, payload, userContext);

    expect(mockCollection.add).toHaveBeenCalled();
    expect(result.id).toBe('new-id');
    expect(result.rating).toBe('Good');
    expect(result.createdBy).toBe('user1');
  });

  test('upsertEvaluation updates existing document if ID provided', async () => {
    const tenantId = 'tenant1';
    const employeeId = 'emp123';
    const payload = { id: 'eval1', rating: 'Better' };
    const userContext = { uid: 'user1' };

    const result = await upsertEvaluation(tenantId, employeeId, payload, userContext);

    expect(mockCollection.doc).toHaveBeenCalledWith('eval1');
    expect(mockDoc.set).toHaveBeenCalled();
    expect(result.rating).toBe('Better');
  });
});
