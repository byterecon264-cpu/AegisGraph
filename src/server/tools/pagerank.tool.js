import { IGraphTool, ToolResult } from './tool.interface.js';

/**
 * Computes PageRank across graph nodes and directed edges using power iteration.
 *
 * @param {Array<object>} nodes
 * @param {Array<object>} edges
 * @param {number} [damping=0.85]
 * @param {number} [iterations=30]
 * @returns {Map<string, number>} Map of nodeId -> PageRank score
 */
export function computePageRank(nodes, edges, damping = 0.85, iterations = 30) {
  const N = nodes.length;
  if (N === 0) return new Map();

  const nodeIds = nodes.map((n) => n.id);
  const outDegree = new Map();
  const incoming = new Map();

  for (const id of nodeIds) {
    outDegree.set(id, 0);
    incoming.set(id, []);
  }

  for (const edge of edges) {
    if (outDegree.has(edge.from) && incoming.has(edge.to)) {
      outDegree.set(edge.from, outDegree.get(edge.from) + 1);
      incoming.get(edge.to).push(edge.from);
    }
  }

  let ranks = new Map();
  const initialRank = 1 / N;
  for (const id of nodeIds) {
    ranks.set(id, initialRank);
  }

  for (let it = 0; it < iterations; it++) {
    const nextRanks = new Map();
    let danglingSum = 0;

    for (const id of nodeIds) {
      if (outDegree.get(id) === 0) {
        danglingSum += ranks.get(id);
      }
    }

    const baseRank = (1 - damping) / N + (damping * danglingSum) / N;

    for (const id of nodeIds) {
      let incomingRankSum = 0;
      for (const sourceId of incoming.get(id)) {
        incomingRankSum += ranks.get(sourceId) / outDegree.get(sourceId);
      }
      nextRanks.set(id, baseRank + damping * incomingRankSum);
    }

    ranks = nextRanks;
  }

  return ranks;
}

export class PageRankTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'pagerank';
    this.description = 'Computes structural importance and blast-radius weighting across nodes using PageRank power iteration.';
    this.parameters = {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Filter node type/label (e.g. "IAMRole", "RDSCluster", or null for all).',
        },
        topK: {
          type: 'number',
          description: 'Number of top-ranked nodes to return (default: 5)',
        },
        dampingFactor: {
          type: 'number',
          description: 'Damping factor (default: 0.85)',
        },
      },
    };
  }

  async execute(params, repository) {
    const nodeType = params?.nodeType || null;
    const topK = Number(params?.topK) || 5;
    const damping = Number(params?.dampingFactor) || 0.85;

    try {
      const allNodes = await repository.getNodes();
      const allEdges = await repository.getEdges();

      if (allNodes.length === 0) {
        return ToolResult.ok([], { summary: 'Graph is empty.' });
      }

      const ranks = computePageRank(allNodes, allEdges, damping);

      let maxRank = 0;
      for (const r of ranks.values()) {
        if (r > maxRank) maxRank = r;
      }

      let scored = allNodes.map((n) => {
        const raw = ranks.get(n.id) || 0;
        const normalized = maxRank > 0 ? Number((raw / maxRank).toFixed(4)) : 0;
        return {
          id: n.id,
          name: n.name || n.id,
          labels: n.labels || [],
          primaryLabel: n.labels?.[0] || 'Resource',
          rawPageRank: Number(raw.toFixed(6)),
          normalizedScore: normalized,
        };
      });

      if (nodeType) {
        scored = scored.filter(
          (n) => n.labels.includes(nodeType) || n.primaryLabel === nodeType
        );
      }

      scored.sort((a, b) => b.rawPageRank - a.rawPageRank);
      const topResults = scored.slice(0, topK);

      const topNode = topResults[0] || null;
      const summary = topNode
        ? `Top PageRank node: "${topNode.id}" (${topNode.normalizedScore}) represents highest structural weight.`
        : 'PageRank computed across graph.';

      return ToolResult.ok({
        filterLabel: nodeType,
        highestBlastRadiusNodeId: topNode?.id || null,
        topRanked: topResults,
      }, { summary });
    } catch (err) {
      return ToolResult.fail(err.message);
    }
  }
}
