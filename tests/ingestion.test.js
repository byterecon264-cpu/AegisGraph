import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { IngestorFactory } from '../src/server/ingestion/ingestor.factory.js';
import { JSONIngestor } from '../src/server/ingestion/json.ingestor.js';
import { IngestionService } from '../src/server/ingestion/ingestion.service.js';
import { getGraph, closeConnection } from '../src/server/graph/connection.js';

describe('Phase 1: Scenario Modeling & Multi-Scenario Ingestion', () => {
  const testGraph = 'aegisgraph_phase1_test';
  const service = new IngestionService();

  after(async () => {
    const graph = await getGraph(testGraph);
    await graph.delete().catch(() => {});
    await closeConnection();
  });

  describe('JSONIngestor & IngestorFactory', () => {
    it('factory should resolve JSONIngestor instance for "json"', () => {
      const ingestor = IngestorFactory.getIngestor('json');
      assert.ok(ingestor instanceof JSONIngestor);
    });

    it('factory should reject unsupported formats', () => {
      assert.throws(() => {
        IngestorFactory.getIngestor('unsupported_format_xyz');
      }, /Unsupported format/);
    });

    it('should reject invalid scenario payloads missing required fields', () => {
      const ingestor = new JSONIngestor();
      assert.throws(() => ingestor.parse({}), /scenario_id/);
      assert.throws(() => ingestor.parse({ scenario_id: 'test' }), /nodes/);
    });

    it('should reject edges with unknown source or target nodes', () => {
      const ingestor = new JSONIngestor();
      assert.throws(() => {
        ingestor.parse({
          scenario_id: 'bad-edge',
          nodes: [{ id: 'n1', label: 'EC2' }],
          edges: [{ from: 'n1', to: 'n2_nonexistent', type: 'CONNECTS' }],
        });
      }, /unknown target node/);
    });

    it('should auto-tag CrownJewels for sensitive data classes', () => {
      const ingestor = new JSONIngestor();
      const payload = ingestor.parse({
        scenario_id: 'crown-test',
        nodes: [
          { id: 'db1', label: 'RDSCluster', data_class: 'financial' },
          { id: 's3_1', label: 'S3Bucket', data_class: 'PII' },
          { id: 'web', label: 'EC2Instance', data_class: 'public' },
        ],
        edges: [],
      });

      assert.equal(payload.nodes[0].isCrownJewel, true);
      assert.ok(payload.nodes[0].labels.includes('CrownJewel'));
      assert.equal(payload.nodes[1].isCrownJewel, true);
      assert.ok(payload.nodes[1].labels.includes('CrownJewel'));
      assert.equal(payload.nodes[2].isCrownJewel, false);
      assert.ok(!payload.nodes[2].labels.includes('CrownJewel'));
    });
  });

  describe('IngestionService & FalkorDB Multi-Scenario Loading', () => {
    it('should load Scenario 1 (leaked-key) and verify multi-hop attack path', async () => {
      const result = await service.loadScenarioById('leaked-key', { graphName: testGraph });
      assert.equal(result.success, true);
      assert.equal(result.scenarioId, 'leaked-key');
      assert.equal(result.nodesCount, 14);
      assert.equal(result.edgesCount, 16);
      assert.equal(result.crownJewelsCount, 3);

      const graph = await getGraph(testGraph);

      // Verify that multi-hop lateral movement path exists to RDSCluster
      const pathRes = await graph.query(
        `MATCH p = (ec2:EC2Instance {id: 'i-0abc123'})-[*1..5]->(rds:RDSCluster {id: 'rds/prod-customer-db'})
         RETURN count(p) AS paths`
      );
      const pathsFound = pathRes.data?.[0]?.paths ?? 0;
      assert.ok(pathsFound >= 1, 'At least 1 multi-hop path should connect public EC2 to RDS');

      // Verify CrownJewels have correct label in DB
      const crownRes = await graph.query('MATCH (c:CrownJewel) RETURN count(c) AS count');
      assert.equal(crownRes.data?.[0]?.count, 3);
    });

    it('should load Scenario 2 (supply-chain) and verify CI-to-DynamoDB path', async () => {
      const result = await service.loadScenarioById('supply-chain', { graphName: testGraph });
      assert.equal(result.success, true);
      assert.equal(result.scenarioId, 'supply-chain');
      assert.equal(result.nodesCount, 10);
      assert.equal(result.edgesCount, 10);
      assert.equal(result.crownJewelsCount, 3);

      const graph = await getGraph(testGraph);
      const pathRes = await graph.query(
        `MATCH p = (runner:EC2Instance {id: 'gh-runner-01'})-[*1..5]->(table:DynamoDBTable)
         RETURN count(p) AS paths`
      );
      assert.ok((pathRes.data?.[0]?.paths ?? 0) >= 1);
    });

    it('should load Scenario 3 (insider-threat) and verify contractor privilege escalation path', async () => {
      const result = await service.loadScenarioById('insider-threat', { graphName: testGraph });
      assert.equal(result.success, true);
      assert.equal(result.scenarioId, 'insider-threat');
      assert.equal(result.nodesCount, 9);
      assert.equal(result.edgesCount, 9);
      assert.equal(result.crownJewelsCount, 4);

      const graph = await getGraph(testGraph);
      const pathRes = await graph.query(
        `MATCH p = (user:IAMUser {id: 'usr-contractor-ext-44'})-[*1..4]->(vault:S3Bucket {id: 's3://corp-secrets-vault'})
         RETURN count(p) AS paths`
      );
      assert.ok((pathRes.data?.[0]?.paths ?? 0) >= 1);
    });
  });
});
