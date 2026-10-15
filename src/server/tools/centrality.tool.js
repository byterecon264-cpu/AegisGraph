import { IGraphTool, ToolResult } from './tool.interface.js';

/**
 * Computes exact Betweenness Centrality for all nodes using Brandes' Algorithm (O(V * E)).
 *
 * @param {Array<object>} nodes - Array of nodes with `id`
 * @param {Array<object>} edges - Array of edges with `from` and `to`
 * @returns {Map<string, number>} Map of nodeId -> raw betweenness score
 */
export function computeBrandesBetweenness(nodes, edges) {
  const nodeIds = nodes.map((n) => n.id);
  const adj = new Map();
  for (const id of nodeIds) {
    adj.set(id, []);
  }
  for (const edge of edges) {
    if (adj.has(edge.from) && adj.has(edge.to)) {
      adj.get(edge.from).push(edge.to);
    }
  }

  const cb = new Map();
  for (const id of nodeIds) {
    cb.set(id, 0);
  }

  for (const s of nodeIds) {
    const stack = [];
    const pred = new Map();
    const sigma = new Map();
    const dist = new Map();

    for (const v of nodeIds) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
    }

    sigma.set(s, 1);
    dist.set(s, 0);

    const queue = [s];
    while (queue.length > 0) {
      const v = queue.shift();
      stack.push(v);

      for (const w of adj.get(v) || []) {
        if (dist.get(w) < 0) {
          dist.set(w, dist.get(v) + 1);
          queue.push(w);
        }
        if (dist.get(w) === dist.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v));
          pred.get(w).push(v);
        }
      }
    }

    const delta = new Map();
    for (const v of nodeIds) {
      delta.set(v, 0);
    }

    while (stack.length > 0) {
      const w = stack.pop();
      for (const v of pred.get(w)) {
        const coef = (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w));
        delta.set(v, delta.get(v) + coef);
      }
      if (w !== s) {
        cb.set(w, cb.get(w) + delta.get(w));
      }
    }
  }

  return cb;
}

export class CentralityTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'betweenness_centrality';
    this.description = 'Computes Betweenness Centrality across the infrastructure graph to identify "toxic pivot" identities bridging low-privilege entrypoints and high-privilege crown jewels.';
    this.parameters = {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Filter node type/label (e.g., "IAMRole", "EC2Instance", or null for all). Defaults to "IAMRole".',
        },
        topK: {
          type: 'number',
          description: 'Number of top central nodes to return (default: 5)',
        },
      },
    };
  }

  async execute(params, repository) {
    const nodeType = params?.nodeType || null;
    const topK = Number(params?.topK) || 5;

    try {
      const allNodes = await repository.getNodes();
      const allEdges = await repository.getEdges();

      if (allNodes.length === 0) {
        return ToolResult.ok([], { summary: 'Graph is empty.' });
      }

      const rawScores = computeBrandesBetweenness(allNodes, allEdges);

      let maxScore = 0;
      for (const score of rawScores.values()) {
        if (score > maxScore) maxScore = score;
      }

      let scoredNodes = allNodes.map((n) => {
        const raw = rawScores.get(n.id) || 0;
        const normalized = maxScore > 0 ? Number((raw / maxScore).toFixed(4)) : 0;
        return {
          id: n.id,
          name: n.name || n.id,
          labels: n.labels || [],
          primaryLabel: n.labels?.[0] || 'Resource',
          rawBetweenness: raw,
          normalizedScore: normalized,
        };
      });

      if (nodeType) {
        scoredNodes = scoredNodes.filter(
          (n) => n.labels.includes(nodeType) || n.primaryLabel === nodeType
        );
      }

      scoredNodes.sort((a, b) => b.rawBetweenness - a.rawBetweenness);
      const topResults = scoredNodes.slice(0, topK);

      const toxicPivot = topResults.length > 0 && topResults[0].rawBetweenness > 0 ? topResults[0] : null;

      const summary = toxicPivot
        ? `Identified toxic pivot: "${toxicPivot.id}" with betweenness centrality of ${toxicPivot.normalizedScore}.`
        : 'Centrality computed; no significant pivot bottlenecks detected.';

      return ToolResult.ok({
        filterLabel: nodeType,
        toxicPivotId: toxicPivot?.id || null,
        topRanked: topResults,
      }, { summary });
    } catch (err) {
      return ToolResult.fail(err.message);
    }
  }
}
