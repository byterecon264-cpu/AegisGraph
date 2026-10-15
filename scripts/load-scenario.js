import { IngestionService } from '../src/server/ingestion/ingestion.service.js';
import { getGraph, closeConnection, dbConfig } from '../src/server/graph/connection.js';

const AVAILABLE_SCENARIOS = ['leaked-key', 'supply-chain', 'insider-threat'];

async function main() {
  const args = process.argv.slice(2);
  let scenarioTarget = args[0] || 'leaked-key';
  let graphName = dbConfig.graphName;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--graph' && args[i + 1]) {
      graphName = args[i + 1];
      i++;
    }
  }

  console.log('====================================================');
  console.log('🛡️  AegisGraph — Multi-Scenario Ingestion Engine');
  console.log('====================================================');

  const targets = scenarioTarget === 'all' ? AVAILABLE_SCENARIOS : [scenarioTarget];
  const service = new IngestionService();

  try {
    for (const target of targets) {
      console.log(`\n📦 Loading Scenario: "${target}" into graph "${graphName}"...`);
      const result = await service.loadScenarioById(target, { graphName });

      console.log(`✅ Loaded: "${result.name}"`);
      console.log(`   • Scenario ID:    ${result.scenarioId}`);
      console.log(`   • Nodes Created:  ${result.nodesCount}`);
      console.log(`   • Edges Created:  ${result.edgesCount}`);
      console.log(`   • Crown Jewels:   ${result.crownJewelsCount}`);
      console.log(`   • Ingestion Time: ${result.durationMs}ms`);

      if (result.alert) {
        console.log(`   🚨 Trigger Alert: [${result.alert.severity}] ${result.alert.message}`);
      }

      // Verification Cypher query
      const graph = await getGraph(graphName);
      const verifyNodes = await graph.query('MATCH (n) RETURN count(n) AS count');
      const verifyEdges = await graph.query('MATCH ()-[r]->() RETURN count(r) AS count');
      const crownNodes = await graph.query('MATCH (n:CrownJewel) RETURN n.id AS id, n.data_class AS data_class');

      console.log(`\n🔎 FalkorDB Verification Query:`);
      console.log(`   • MATCH (n) RETURN count(n):       ${verifyNodes.data?.[0]?.count} nodes`);
      console.log(`   • MATCH ()-[r]->() RETURN count(r): ${verifyEdges.data?.[0]?.count} edges`);
      console.log(`   • Crown Jewel Assets:`);
      for (const row of crownNodes.data || []) {
        console.log(`     - [${row.data_class || 'CrownJewel'}] ${row.id}`);
      }
    }

    console.log('\n====================================================');
    console.log('✅ Scenario Ingestion & FalkorDB Indexing Verified');
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Scenario ingestion failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

main();
