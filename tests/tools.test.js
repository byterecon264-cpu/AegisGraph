import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getGraph, closeConnection } from '../src/server/graph/connection.js';
import { IngestionService } from '../src/server/ingestion/ingestion.service.js';
import { GraphRepository } from '../src/server/graph/repository.js';
import { ToolRegistry } from '../src/server/tools/tool.registry.js';
import { AegisScorer } from '../src/server/tools/aegis-scorer.js';

describe('Phase 2: GraphRepository, 7 Strategy Tools & AegisScorer', () => {
  const testGraphName = 'aegisgraph_phase2_tools_test';
  let repository;
  let registry;

  before(async () => {
    // Load scenario 1 (leaked-key) into isolated test graph
    const ingestion = new IngestionService();
    await ingestion.loadScenarioById('leaked-key', { graphName: testGraphName });

    repository = new GraphRepository(testGraphName);
    registry = ToolRegistry.createDefaultRegistry();
  });

  after(async () => {
    const graph = await getGraph(testGraphName);
    await graph.delete().catch(() => {});
    await closeConnection();
  });

  describe('GraphRepository Primitives', () => {
    it('getNodeById should fetch node with properties and labels', async () => {
      const node = await repository.getNodeById('i-0abc123');
      assert.ok(node, 'Node i-0abc123 should exist');
      assert.equal(node.id, 'i-0abc123');
      assert.ok(node.labels.includes('EC2Instance'));
      assert.equal(node.name, 'web-server-prod');
    });

    it('getNodes and getEdges should fetch full topology', async () => {
      const nodes = await repository.getNodes();
      const edges = await repository.getEdges();
      assert.equal(nodes.length, 14);
      assert.equal(edges.length, 16);
    });

    it('getSnapshot and diffSnapshots should detect added and removed edges', async () => {
      const snap1 = await repository.getSnapshot();

      // Temporarily add edge
      await repository.createEdge('role/BillingViewer', 'rds/prod-customer-db', 'CAN_READ');
      const snap2 = await repository.getSnapshot();

      const diff = repository.diffSnapshots(snap1, snap2);
      assert.equal(diff.topologyChanged, true);
      assert.equal(diff.addedEdges.length, 1);
      assert.equal(diff.addedEdges[0].from, 'role/BillingViewer');
      assert.equal(diff.addedEdges[0].to, 'rds/prod-customer-db');

      // Revert edge
      await repository.deleteEdge('role/BillingViewer', 'rds/prod-customer-db', 'CAN_READ');
    });
  });

  describe('ToolRegistry & MCP / OpenAI Schemas', () => {
    it('registry should contain all 7 core tools', () => {
      const tools = registry.listAll();
      assert.equal(tools.length, 7);
      const names = tools.map((t) => t.name);
      assert.ok(names.includes('query_graph'));
      assert.ok(names.includes('shortest_path'));
      assert.ok(names.includes('blast_radius'));
      assert.ok(names.includes('betweenness_centrality'));
      assert.ok(names.includes('pagerank'));
      assert.ok(names.includes('what_if_simulate'));
      assert.ok(names.includes('drift_detect'));
    });

    it('toMCPSchemas should produce valid Model Context Protocol tool array', () => {
      const mcp = registry.toMCPSchemas();
      assert.equal(mcp.length, 7);
      for (const t of mcp) {
        assert.ok(t.name, 'MCP tool must have name');
        assert.ok(t.description, 'MCP tool must have description');
        assert.equal(t.inputSchema.type, 'object');
      }
    });

    it('toOpenAITools should format as function calling objects', () => {
      const tools = registry.toOpenAITools();
      assert.equal(tools.length, 7);
      for (const t of tools) {
        assert.equal(t.type, 'function');
        assert.ok(t.function.name);
        assert.ok(t.function.description);
        assert.ok(t.function.parameters);
      }
    });
  });

  describe('7 Graph Algorithm Tools Execution', () => {
    it('1. QueryGraphTool: should run Cypher queries and return data rows', async () => {
      const res = await registry.execute(
        'query_graph',
        { query: 'MATCH (c:CrownJewel) RETURN c.id AS id ORDER BY id' },
        repository
      );
      assert.equal(res.success, true);
      assert.equal(res.data.length, 3);
      assert.ok(res.data.some((r) => r.id === 'rds/prod-customer-db'));
    });

    it('2. ShortestPathTool: should discover 4-hop lateral path from EC2 to RDS', async () => {
      const res = await registry.execute(
        'shortest_path',
        { source: 'i-0abc123', target: 'rds/prod-customer-db' },
        repository
      );
      assert.equal(res.success, true);
      assert.ok(res.data, 'Path should be found');
      assert.equal(res.data.hops, 4);

      // Verify node progression
      const nodeIds = res.data.nodes.map((n) => n.id);
      assert.deepEqual(nodeIds, [
        'i-0abc123',
        'role/WebServerRole',
        'role/DevAdmin',
        'role/InfraRole',
        'rds/prod-customer-db',
      ]);
    });

    it('3. BlastRadiusTool: should quantify reachable assets from WebServerRole', async () => {
      const res = await registry.execute(
        'blast_radius',
        { startNode: 'role/WebServerRole', maxDepth: 5 },
        repository
      );
      assert.equal(res.success, true);
      assert.ok(res.data.totalAssetsReachable >= 6);
      assert.equal(res.data.crownJewelsReachable, 3);
      assert.ok(res.data.dataClassBreakdown.financial >= 1);
      assert.ok(res.data.dataClassBreakdown.PII >= 1);
    });

    it('4. CentralityTool: should compute betweenness and identify top toxic pivots', async () => {
      const res = await registry.execute(
        'betweenness_centrality',
        { nodeType: 'IAMRole', topK: 3 },
        repository
      );
      assert.equal(res.success, true);
      const topIds = res.data.topRanked.map((r) => r.id);
      assert.ok(topIds.includes('role/DevAdmin'));
      assert.ok(topIds.includes('role/WebServerRole'));
      assert.ok(res.data.topRanked[0].normalizedScore > 0.5);
    });

    it('5. PageRankTool: should compute structural blast-radius weighting', async () => {
      const res = await registry.execute(
        'pagerank',
        { nodeType: 'IAMRole', topK: 3 },
        repository
      );
      assert.equal(res.success, true);
      assert.ok(res.data.topRanked.length > 0);
      assert.ok(res.data.highestBlastRadiusNodeId);
    });

    it('6. WhatIfTool: should simulate removing WebServerRole -> DevAdmin and show 0 remaining paths', async () => {
      const res = await registry.execute(
        'what_if_simulate',
        {
          removeEdge: {
            from: 'role/WebServerRole',
            to: 'role/DevAdmin',
            type: 'CAN_ASSUME',
          },
          sourceNode: 'i-0abc123',
          targetNode: 'rds/prod-customer-db',
        },
        repository
      );
      assert.equal(res.success, true);
      assert.ok(res.data.pathsBefore >= 1);
      assert.equal(res.data.pathsAfter, 0);
      assert.equal(res.data.threatEliminated, true);
      assert.equal(res.data.reductionPercentage, 100);
    });

    it('7. DriftDetectTool: should detect when a new edge introduces an attack path', async () => {
      const res = await registry.execute(
        'drift_detect',
        {
          newEdge: {
            from: 'role/WebServerRole',
            to: 'rds/prod-customer-db',
            type: 'DIRECT_ACCESS',
          },
        },
        repository
      );
      assert.equal(res.success, true);
      assert.equal(res.data.isDangerousDrift, true);
      assert.ok(res.data.newPathsCreated > 0);
    });
  });

  describe('AegisScorer Engine', () => {
    it('should compute scores (0-100) and assign risk tiers', async () => {
      const scorer = new AegisScorer();
      const scores = await scorer.computeAllScores(repository);

      assert.ok(scores.size > 0);

      // Verify toxic pivot has elevated score
      const devAdminScore = scores.get('role/DevAdmin');
      assert.ok(devAdminScore, 'DevAdmin should have a score');
      assert.ok(devAdminScore.aegisScore >= 60, `DevAdmin score ${devAdminScore.aegisScore} should be >= 60`);
      assert.ok(['HIGH', 'CRITICAL'].includes(devAdminScore.tier));

      // Verify isolated or leaf assets have lower score
      const assetsBucketScore = scores.get('s3://app-assets-prod');
      assert.ok(assetsBucketScore);
      assert.ok(assetsBucketScore.aegisScore < devAdminScore.aegisScore);
    });
  });
});
