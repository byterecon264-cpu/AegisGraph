import { getFalkorClient, getGraph, closeConnection, dbConfig } from '../src/server/graph/connection.js';

async function runSmokeTest() {
  console.log('----------------------------------------------------');
  console.log('🛡️  AegisGraph — FalkorDB Smoke Test (Phase 0)');
  console.log('----------------------------------------------------');
  console.log(`📡 Connecting to FalkorDB at ${dbConfig.host}:${dbConfig.port}...`);

  const testGraphName = `${dbConfig.graphName}_phase0_smoketest`;
  const testId = `smoke_${Date.now()}`;
  const timestamp = new Date().toISOString();

  try {
    const client = await getFalkorClient();
    console.log('🔌 Client connected successfully.');

    const graph = await getGraph(testGraphName);
    console.log(`📊 Selected test graph: "${testGraphName}"`);

    // 1. Create a test node
    console.log('📝 Step 1: Creating test node...');
    const createQuery = `CREATE (n:AegisSmokeTest {id: '${testId}', name: 'Phase0-Verification', timestamp: '${timestamp}'}) RETURN n.id AS id, n.name AS name`;
    const createResult = await graph.query(createQuery);
    console.log('   Test node created:', createResult.data);

    // 2. Read back the test node
    console.log('🔍 Step 2: Reading back test node...');
    const readQuery = `MATCH (n:AegisSmokeTest {id: '${testId}'}) RETURN n.id AS id, n.name AS name, n.timestamp AS timestamp`;
    const readResult = await graph.query(readQuery);

    if (!readResult.data || readResult.data.length === 0) {
      throw new Error(`Failed to find created test node with id: ${testId}`);
    }

    const fetchedNode = readResult.data[0];
    console.log('   Fetched node:', fetchedNode);

    if (fetchedNode.id !== testId || fetchedNode.name !== 'Phase0-Verification') {
      throw new Error(`Node properties mismatch. Expected id=${testId}, got ${JSON.stringify(fetchedNode)}`);
    }

    // 3. Delete the test node
    console.log('🧹 Step 3: Deleting test node...');
    const deleteQuery = `MATCH (n:AegisSmokeTest {id: '${testId}'}) DELETE n`;
    await graph.query(deleteQuery);

    // 4. Verify deletion
    const verifyQuery = `MATCH (n:AegisSmokeTest {id: '${testId}'}) RETURN count(n) AS remaining`;
    const verifyResult = await graph.query(verifyQuery);
    const countRemaining = verifyResult.data?.[0]?.remaining ?? 0;

    if (countRemaining !== 0) {
      throw new Error(`Expected 0 nodes remaining, found: ${countRemaining}`);
    }
    console.log('   Test node successfully removed.');

    // 5. Clean up temporary test graph
    await graph.delete().catch(() => {});
    console.log('   Temporary test graph cleaned up.');

    console.log('----------------------------------------------------');
    console.log('✅ FalkorDB connection verified');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (error) {
    console.error('❌ FalkorDB connection test failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

runSmokeTest();
