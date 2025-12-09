/**
 * Script to configure a Tenant for multi-tenant evaluations.
 * 
 * Usage:
 * node scripts/configure-tenant.js --tenantId <company_id> --projectId <firebase_project_id> --envVar <env_var_name>
 * 
 * Example:
 * node scripts/configure-tenant.js --tenantId "company_A" --projectId "inspire-evals-a" --envVar "TENANT_A_CREDS"
 */

const admin = require('../src/utils/firebaseAdmin');
const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : null;
}

const tenantId = getArg('tenantId');
const projectId = getArg('projectId');
const envVarName = getArg('envVar');
const databaseURL = getArg('databaseURL') || `https://${projectId}.firebaseio.com`; // Default guess

if (!tenantId || !projectId || !envVarName) {
  console.error('Usage: node scripts/configure-tenant.js --tenantId <id> --projectId <id> --envVar <ENV_VAR_NAME>');
  process.exit(1);
}

async function configureTenant() {
  try {
    console.log(`🔧 Configuring tenant: ${tenantId}`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Env Var Name: ${envVarName}`);
    
    const collection = admin.firestore().collection('TenantConfigs');
    
    await collection.doc(tenantId).set({
      tenantId: tenantId,
      evalProjectId: projectId,
      evalDatabaseURL: databaseURL,
      evalServiceAccountEnv: envVarName,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`✅ Successfully configured tenant '${tenantId}' in TenantConfigs collection.`);
    console.log(`\nIMPORTANT NEXT STEPS:`);
    console.log(`1. Go to your backend environment variables (.env or Cloud Provider settings).`);
    console.log(`2. Create a variable named '${envVarName}'.`);
    console.log(`3. Paste the contents of your Service Account JSON for project '${projectId}' into that variable.`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error configuring tenant:', error);
    process.exit(1);
  }
}

configureTenant();
