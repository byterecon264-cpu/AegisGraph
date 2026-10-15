import { getGraph, dbConfig } from './connection.js';

/**
 * GraphRepository implements the Repository Pattern for FalkorDB graph access,
 * providing high-level graph query primitives, path traversals, and topology diffing.
 */
export class GraphRepository {
  /**
   * @param {string} [graphName=dbConfig.graphName]
   */
  constructor(graphName = dbConfig.graphName) {
    this.graphName = graphName;
  }

  /**
   * Returns the underlying FalkorDB Graph client.
   *
   * @returns {Promise<import('falkordb').Graph>}
   */
  async getGraph() {
    return getGraph(this.graphName);
  }

  /**
   * Executes a Cypher query with error handling.
   *
   * @param {string} cypherQuery
   * @param {object} [options]
   * @returns {Promise<import('falkordb').GraphReply<any>>}
   */
  async query(cypherQuery, options) {
    const graph = await this.getGraph();
    try {
      return await graph.query(cypherQuery, options);
    } catch (err) {
      throw new Error(`GraphRepository.query failed on "${this.graphName}": ${err.message}\nQuery: ${cypherQuery}`);
    }
  }

  /**
   * Retrieves a single node by its ID along with its labels and properties.
   *
   * @param {string} nodeId
   * @returns {Promise<object|null>}
   */
  async getNodeById(nodeId) {
    const cypher = `MATCH (n {id: ${JSON.stringify(nodeId)}}) RETURN n, labels(n) AS labels`;
    const res = await this.query(cypher);
    if (!res.data || res.data.length === 0) return null;

    const row = res.data[0];
    return {
      ...(row.n?.properties || row.n || {}),
      labels: row.labels || [],
    };
  }

  /**
   * Retrieves all nodes matching an optional primary label.
   *
   * @param {string} [label]
   * @returns {Promise<Array<object>>}
   */
  async getNodes(label = null) {
    const labelPattern = label ? `:${label.replace(/[^a-zA-Z0-9_]/g, '')}` : '';
    const cypher = `MATCH (n${labelPattern}) RETURN n, labels(n) AS labels`;
    const res = await this.query(cypher);

    return (res.data || []).map((row) => ({
      ...(row.n?.properties || row.n || {}),
      labels: row.labels || [],
    }));
  }

  /**
   * Retrieves all edges in the graph.
   *
   * @returns {Promise<Array<object>>}
   */
  async getEdges() {
    const cypher = `MATCH (a)-[r]->(b) RETURN a.id AS from, b.id AS to, type(r) AS type, properties(r) AS properties`;
    const res = await this.query(cypher);

    return (res.data || []).map((row) => ({
      from: row.from,
      to: row.to,
      type: row.type,
      properties: row.properties || {},
    }));
  }

  /**
   * Finds the shortest path between a source node and target node (or crown jewel).
   *
   * @param {string} sourceId
   * @param {string} targetId
   * @param {number} [maxHops=6]
   * @returns {Promise<object|null>}
   */
  async shortestPath(sourceId, targetId, maxHops = 6) {
    const cypher = `
      MATCH (src {id: ${JSON.stringify(sourceId)}}), (dst {id: ${JSON.stringify(targetId)}})
      WITH shortestPath((src)-[*..${Math.min(maxHops, 15)}]->(dst)) AS p
      WHERE p IS NOT NULL
      RETURN length(p) AS hops,
             [n IN nodes(p) | { id: n.id, name: n.name, label: labels(n)[0], crown_jewel: n.crown_jewel, data_class: n.data_class }] AS nodes,
             [r IN relationships(p) | { type: type(r), from: startNode(r).id, to: endNode(r).id }] AS edges
    `;
    const res = await this.query(cypher);
    if (!res.data || res.data.length === 0) return null;

    const row = res.data[0];
    return {
      hops: row.hops,
      nodes: row.nodes,
      edges: row.edges,
    };
  }

  /**
   * Finds all shortest paths from a source to all CrownJewel nodes.
   *
   * @param {string} sourceId
   * @param {number} [maxHops=6]
   * @returns {Promise<Array<object>>}
   */
  async findPathsToCrownJewels(sourceId, maxHops = 6) {
    const cypher = `
      MATCH (src {id: ${JSON.stringify(sourceId)}}), (target:CrownJewel)
      WHERE src <> target
      WITH target, shortestPath((src)-[*..${Math.min(maxHops, 15)}]->(target)) AS p
      WHERE p IS NOT NULL
      RETURN target.id AS targetId,
             target.name AS targetName,
             target.data_class AS dataClass,
             length(p) AS hops,
             [n IN nodes(p) | { id: n.id, name: n.name, label: labels(n)[0] }] AS nodes,
             [r IN relationships(p) | { type: type(r), from: startNode(r).id, to: endNode(r).id }] AS edges
      ORDER BY hops ASC
    `;
    const res = await this.query(cypher);
    return res.data || [];
  }

  /**
   * Computes multi-hop reachable assets from a start node up to maxDepth.
   *
   * @param {string} startNodeId
   * @param {number} [maxDepth=5]
   * @returns {Promise<Array<object>>}
   */
  async getReachableAssets(startNodeId, maxDepth = 5) {
    const cypher = `
      MATCH (src {id: ${JSON.stringify(startNodeId)}})
      MATCH p = (src)-[*1..${Math.min(maxDepth, 10)}]->(target)
      WHERE src <> target
      WITH target, min(length(p)) AS minHops, collect(p)[0] AS samplePath
      RETURN target.id AS id,
             target.name AS name,
             labels(target) AS labels,
             target.data_class AS data_class,
             target.crown_jewel AS crown_jewel,
             minHops AS hops
      ORDER BY hops ASC, target.crown_jewel DESC
    `;
    const res = await this.query(cypher);
    return res.data || [];
  }

  /**
   * Deletes a directed relationship between two nodes.
   *
   * @param {string} fromId
   * @param {string} toId
   * @param {string} [type]
   * @returns {Promise<boolean>}
   */
  async deleteEdge(fromId, toId, type = null) {
    const typeFilter = type ? `:${type.replace(/[^a-zA-Z0-9_]/g, '')}` : '';
    const cypher = `
      MATCH (a {id: ${JSON.stringify(fromId)}})-[r${typeFilter}]->(b {id: ${JSON.stringify(toId)}})
      DELETE r
      RETURN count(r) AS deletedCount
    `;
    const res = await this.query(cypher);
    const count = res.data?.[0]?.deletedCount ?? 0;
    return count > 0;
  }

  /**
   * Creates a directed relationship between two nodes.
   *
   * @param {string} fromId
   * @param {string} toId
   * @param {string} type
   * @param {object} [properties={}]
   * @returns {Promise<boolean>}
   */
  async createEdge(fromId, toId, type, properties = {}) {
    const cleanType = type.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    const propsEntries = Object.entries(properties).map(
      ([k, v]) => `${k.replace(/[^a-zA-Z0-9_]/g, '_')}: ${JSON.stringify(v)}`
    );
    const propsStr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '';

    const cypher = `
      MATCH (a {id: ${JSON.stringify(fromId)}}), (b {id: ${JSON.stringify(toId)}})
      CREATE (a)-[r:${cleanType} ${propsStr}]->(b)
      RETURN count(r) AS createdCount
    `;
    const res = await this.query(cypher);
    const count = res.data?.[0]?.createdCount ?? 0;
    return count > 0;
  }

  /**
   * Captures an in-memory snapshot of all nodes and edges in the graph.
   *
   * @returns {Promise<{ nodes: Array<object>, edges: Array<object>, timestamp: string }>}
   */
  async getSnapshot() {
    const nodes = await this.getNodes();
    const edges = await this.getEdges();
    return {
      nodes,
      edges,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Computes the structural difference between two snapshots.
   *
   * @param {object} beforeSnapshot
   * @param {object} afterSnapshot
   * @returns {object}
   */
  diffSnapshots(beforeSnapshot, afterSnapshot) {
    const beforeNodeIds = new Set(beforeSnapshot.nodes.map((n) => n.id));
    const afterNodeIds = new Set(afterSnapshot.nodes.map((n) => n.id));

    const addedNodes = afterSnapshot.nodes.filter((n) => !beforeNodeIds.has(n.id));
    const removedNodes = beforeSnapshot.nodes.filter((n) => !afterNodeIds.has(n.id));

    const edgeKey = (e) => `${e.from}->${e.type}->${e.to}`;
    const beforeEdges = new Map(beforeSnapshot.edges.map((e) => [edgeKey(e), e]));
    const afterEdges = new Map(afterSnapshot.edges.map((e) => [edgeKey(e), e]));

    const addedEdges = [];
    for (const [key, edge] of afterEdges.entries()) {
      if (!beforeEdges.has(key)) addedEdges.push(edge);
    }

    const removedEdges = [];
    for (const [key, edge] of beforeEdges.entries()) {
      if (!afterEdges.has(key)) removedEdges.push(edge);
    }

    return {
      addedNodes,
      removedNodes,
      addedEdges,
      removedEdges,
      topologyChanged: addedNodes.length > 0 || removedNodes.length > 0 || addedEdges.length > 0 || removedEdges.length > 0,
    };
  }
}
