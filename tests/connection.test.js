import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getFalkorClient, getGraph, closeConnection, dbConfig } from '../src/server/graph/connection.js';

describe('Phase 0: FalkorDB Connection & Graph Primitives', () => {
  after(async () => {
    await closeConnection();
  });

  it('should establish connection and return FalkorDB client', async () => {
    const client = await getFalkorClient();
    assert.ok(client, 'Client should be instantiated');
  });

  it('should select graph and execute basic Cypher lifecycle (create, read, delete)', async () => {
    const testGraphName = `${dbConfig.graphName}_unit_test`;
    const graph = await getGraph(testGraphName);
    const testKey = `test_${Date.now()}`;

    // Create
    const createRes = await graph.query(
      `CREATE (n:UnitTestNode {key: '${testKey}', status: 'active'}) RETURN n.key AS key`
    );
    assert.equal(createRes.data?.[0]?.key, testKey);

    // Read
    const readRes = await graph.query(
      `MATCH (n:UnitTestNode {key: '${testKey}'}) RETURN n.status AS status`
    );
    assert.equal(readRes.data?.[0]?.status, 'active');

    // Delete
    await graph.query(`MATCH (n:UnitTestNode {key: '${testKey}'}) DELETE n`);

    // Verify deletion
    const verifyRes = await graph.query(
      `MATCH (n:UnitTestNode {key: '${testKey}'}) RETURN count(n) AS count`
    );
    assert.equal(verifyRes.data?.[0]?.count, 0);

    // Clean up test graph
    await graph.delete().catch(() => {});
  });
});
