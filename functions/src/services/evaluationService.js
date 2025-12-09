const { getDbForTenant } = require('../utils/firebaseFactory');

const COLLECTION = 'evaluations';

async function getEvaluationsForEmployee(tenantId, employeeId) {
  const db = await getDbForTenant(tenantId, 'evaluation');
  const snapshot = await db.collection(COLLECTION)
    .where('employeeId', '==', employeeId)
    .orderBy('updatedAt', 'desc')
    .get();
    
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function upsertEvaluation(tenantId, employeeId, payload, userContext) {
  const db = await getDbForTenant(tenantId, 'evaluation');
  
  const now = new Date().toISOString();
  // Remove id from payload if present to avoid duplicating it in data
  const { id, ...data } = payload;
  
  const evaluationData = {
    ...data,
    employeeId,
    updatedAt: now,
    updatedBy: userContext.uid || 'system'
  };

  // If new record (no ID provided in payload), set createdAt
  if (!id && !evaluationData.createdAt) {
      evaluationData.createdAt = now;
      evaluationData.createdBy = userContext.uid || 'system';
  }

  let docRef;
  if (id) {
    docRef = db.collection(COLLECTION).doc(id);
    await docRef.set(evaluationData, { merge: true });
    // Return the ID that was updated
    return { id, ...evaluationData };
  } else {
    docRef = await db.collection(COLLECTION).add(evaluationData);
    return { id: docRef.id, ...evaluationData };
  }
}

module.exports = {
  getEvaluationsForEmployee,
  upsertEvaluation
};
