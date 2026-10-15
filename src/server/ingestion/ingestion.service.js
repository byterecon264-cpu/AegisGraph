import fs from 'node:fs/promises';
import path from 'node:path';
import { getGraph, dbConfig } from '../graph/connection.js';
import { IngestorFactory } from './ingestor.factory.js';

/**
 * Serializes JS values into valid openCypher property literals.
 *
 * @param {any} val
 * @returns {string}
 */
export function formatCypherValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') return JSON.stringify(val);
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    return `[${val.map(formatCypherValue).join(', ')}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val).map(([k, v]) => {
      const safeKey = k.replace(/[^a-zA-Z0-9_]/g, '_');
      return `${safeKey}: ${formatCypherValue(v)}`;
    });
    return `{${entries.join(', ')}}`;
  }
  return JSON.stringify(String(val));
}

export class IngestionService {
  /**
   * Loads a normalized GraphPayload into a FalkorDB graph instance.
   *
   * @param {import('./ingestor.interface.js').GraphPayload} payload
   * @param {object} [options={}]
   * @param {string} [options.graphName] - Optional graph name override
   * @param {boolean} [options.clearExisting=true] - Whether to purge existing data first
   * @returns {Promise<object>} Ingestion metrics and summary
   */
  async loadPayload(payload, options = {}) {
    const graphName = options.graphName || dbConfig.graphName;
    const clearExisting = options.clearExisting !== false;
    const startTime = Date.now();

    const graph = await getGraph(graphName);

    // 1. Clear existing nodes and relationships if requested
    if (clearExisting) {
      await graph.query('MATCH (n) DETACH DELETE n').catch(() => {});
    }

    // 2. Ingest Nodes
    for (const node of payload.nodes) {
      const labelStr = node.labels.join(':');
      const propsStr = formatCypherValue(node.properties);
      const query = `CREATE (n:${labelStr} ${propsStr})`;
      await graph.query(query);
    }

    // 3. Ingest Edges
    for (const edge of payload.edges) {
      const fromLiteral = JSON.stringify(edge.from);
      const toLiteral = JSON.stringify(edge.to);
      const propsStr = formatCypherValue(edge.properties);
      const query = `MATCH (a {id: ${fromLiteral}}), (b {id: ${toLiteral}}) CREATE (a)-[r:${edge.type} ${propsStr}]->(b)`;
      await graph.query(query);
    }

    // 4. Ensure CrownJewel tagging is enforced consistently
    await graph.query(
      `MATCH (n) WHERE n.data_class IN ['PII', 'financial', 'credential', 'PHI'] OR n.crown_jewel = true SET n:CrownJewel, n.crown_jewel = true`
    );

    // 5. Compute verification statistics
    const nodeRes = await graph.query('MATCH (n) RETURN count(n) AS nodeCount');
    const edgeRes = await graph.query('MATCH ()-[r]->() RETURN count(r) AS edgeCount');
    const crownRes = await graph.query('MATCH (n:CrownJewel) RETURN count(n) AS crownCount');

    const totalNodes = nodeRes.data?.[0]?.nodeCount ?? payload.nodes.length;
    const totalEdges = edgeRes.data?.[0]?.edgeCount ?? payload.edges.length;
    const totalCrowns = crownRes.data?.[0]?.crownCount ?? 0;
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      graphName,
      scenarioId: payload.scenario_id,
      name: payload.name,
      description: payload.description,
      alert: payload.alert,
      nodesCount: totalNodes,
      edgesCount: totalEdges,
      crownJewelsCount: totalCrowns,
      durationMs,
    };
  }

  /**
   * Loads a scenario from a file path on disk.
   *
   * @param {string} filePath
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  async loadScenarioFromFile(filePath, options = {}) {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).replace('.', '') || 'json';
    const payload = IngestorFactory.parse(rawContent, ext);
    return this.loadPayload(payload, options);
  }

  /**
   * Loads one of the pre-packaged attack scenarios by its identifier.
   *
   * @param {string} scenarioId - 'leaked-key' | 'supply-chain' | 'insider-threat'
   * @param {object} [options={}]
   * @returns {Promise<object>}
   */
  async loadScenarioById(scenarioId, options = {}) {
    const baseDir = path.resolve(process.cwd(), 'data', 'scenarios');
    const fileName = scenarioId.endsWith('.json') ? scenarioId : `${scenarioId}.json`;
    const fullPath = path.join(baseDir, fileName);

    return this.loadScenarioFromFile(fullPath, options);
  }
}
