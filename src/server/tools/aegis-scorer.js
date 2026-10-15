import { computeBrandesBetweenness } from './centrality.tool.js';
import { computePageRank } from './pagerank.tool.js';

export class AegisScorer {
  /**
   * Computes composite AegisScores (0–100) for all nodes in the graph repository.
   *
   * @param {import('../graph/repository.js').GraphRepository} repository
   * @returns {Promise<Map<string, object>>} Map of nodeId -> Score Breakdown
   */
  async computeAllScores(repository) {
    const nodes = await repository.getNodes();
    const edges = await repository.getEdges();

    if (nodes.length === 0) return new Map();

    // 1. Compute Base Algorithms
    const rawBetweenness = computeBrandesBetweenness(nodes, edges);
    const rawPageRank = computePageRank(nodes, edges);

    let maxBetweenness = 0;
    for (const val of rawBetweenness.values()) {
      if (val > maxBetweenness) maxBetweenness = val;
    }

    let maxPageRank = 0;
    for (const val of rawPageRank.values()) {
      if (val > maxPageRank) maxPageRank = val;
    }

    // 2. Identify Entrypoints and Crown Jewels
    const entrypointIds = new Set(
      nodes
        .filter((n) => n.labels.includes('Internet') || n.labels.includes('PublicIP') || n.cves?.length > 0)
        .map((n) => n.id)
    );

    const crownJewelIds = new Set(
      nodes.filter((n) => n.crown_jewel || n.labels.includes('CrownJewel')).map((n) => n.id)
    );

    // Build adjacency list for reachability
    const adj = new Map();
    const reverseAdj = new Map();
    for (const n of nodes) {
      adj.set(n.id, []);
      reverseAdj.set(n.id, []);
    }
    for (const e of edges) {
      if (adj.has(e.from)) adj.get(e.from).push(e.to);
      if (reverseAdj.has(e.to)) reverseAdj.get(e.to).push(e.from);
    }

    // 3. Score every node
    const scoreMap = new Map();

    for (const node of nodes) {
      const prNorm = maxPageRank > 0 ? (rawPageRank.get(node.id) || 0) / maxPageRank : 0;
      const bwNorm = maxBetweenness > 0 ? (rawBetweenness.get(node.id) || 0) / maxBetweenness : 0;

      // Distance from entrypoints (BFS)
      const distFromEntry = this.#shortestDistance(entrypointIds, node.id, reverseAdj);
      let entryScore = 0;
      if (entrypointIds.has(node.id)) entryScore = 1.0;
      else if (distFromEntry === 1) entryScore = 0.9;
      else if (distFromEntry === 2) entryScore = 0.75;
      else if (distFromEntry === 3) entryScore = 0.55;
      else if (distFromEntry > 3) entryScore = 0.3;

      // Reachability to crown jewels (BFS)
      const distToCrown = this.#shortestDistance(crownJewelIds, node.id, adj);
      let crownScore = 0;
      if (crownJewelIds.has(node.id)) crownScore = 1.0;
      else if (distToCrown === 1) crownScore = 0.9;
      else if (distToCrown === 2) crownScore = 0.75;
      else if (distToCrown === 3) crownScore = 0.55;
      else if (distToCrown > 3) crownScore = 0.35;

      // Privilege weighting
      let privScore = 0.2;
      const lowerId = node.id.toLowerCase();
      if (
        lowerId.includes('admin') ||
        lowerId.includes('infra') ||
        lowerId.includes('breakglass') ||
        node.compliance_violations?.length > 0
      ) {
        privScore = 0.95;
      } else if (lowerId.includes('role') || lowerId.includes('task') || lowerId.includes('runner')) {
        privScore = 0.65;
      }

      // Formula: 0.35 * PR + 0.25 * BW + 0.20 * Entry + 0.10 * Crown + 0.10 * Priv
      const composite =
        0.35 * prNorm +
        0.25 * bwNorm +
        0.20 * entryScore +
        0.10 * crownScore +
        0.10 * privScore;

      const aegisScore = Math.min(100, Math.max(0, Math.round(composite * 100)));

      let tier = 'LOW';
      if (aegisScore >= 80) tier = 'CRITICAL';
      else if (aegisScore >= 55) tier = 'HIGH';
      else if (aegisScore >= 35) tier = 'MEDIUM';

      scoreMap.set(node.id, {
        nodeId: node.id,
        name: node.name || node.id,
        labels: node.labels,
        aegisScore,
        tier,
        factors: {
          pagerank: Number(prNorm.toFixed(3)),
          betweenness: Number(bwNorm.toFixed(3)),
          internetReachability: Number(entryScore.toFixed(3)),
          sensitiveAccess: Number(crownScore.toFixed(3)),
          privilegeLevel: Number(privScore.toFixed(3)),
        },
      });
    }

    return scoreMap;
  }

  #shortestDistance(targetSet, startId, graphAdj) {
    if (targetSet.has(startId)) return 0;

    const visited = new Set([startId]);
    const queue = [{ id: startId, dist: 0 }];

    while (queue.length > 0) {
      const { id, dist } = queue.shift();
      if (dist >= 8) break;

      for (const nextId of graphAdj.get(id) || []) {
        if (targetSet.has(nextId)) {
          return dist + 1;
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, dist: dist + 1 });
        }
      }
    }

    return -1;
  }
}
