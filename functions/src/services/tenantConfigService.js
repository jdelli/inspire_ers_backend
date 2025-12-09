const admin = require('../utils/firebaseAdmin');

const COLLECTION_NAME = 'TenantConfigs';

/**
 * Retrieves the tenant configuration for a given tenant ID.
 * @param {string} tenantId 
 * @returns {Promise<Object>} Tenant config
 */
async function getTenantConfig(tenantId) {
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  try {
    // Strategy: Try to find by document ID first (assuming tenantId is the doc ID)
    const docRef = admin.firestore().collection(COLLECTION_NAME).doc(tenantId);
    const doc = await docRef.get();

    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    
    // Fallback: query by tenantId field
    const snapshot = await admin.firestore().collection(COLLECTION_NAME)
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    throw new Error(`Tenant configuration not found for tenantId: ${tenantId}`);
  } catch (error) {
    console.error(`Error fetching tenant config for ${tenantId}:`, error);
    throw error;
  }
}

module.exports = {
  getTenantConfig
};
