import { IGraphTool, ToolResult } from './tool.interface.js';

export class BlastRadiusTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'blast_radius';
    this.description = 'Calculates the complete downstream blast radius and reachable sensitive assets from a compromised node up to k hops away.';
    this.parameters = {
      type: 'object',
      properties: {
        startNode: {
          type: 'string',
          description: 'The root compromised node ID to evaluate (e.g., "role/WebServerRole")',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum traversal depth (default: 5, max: 10)',
        },
      },
      required: ['startNode'],
    };
  }

  async execute(params, repository) {
    const startNode = params.startNode;
    const maxDepth = Math.min(Number(params.maxDepth) || 5, 10);

    if (!startNode || typeof startNode !== 'string') {
      return ToolResult.fail('Parameter "startNode" is required');
    }

    try {
      const assets = await repository.getReachableAssets(startNode, maxDepth);

      let crownJewelsCount = 0;
      const dataClassBreakdown = {};
      const hopsBreakdown = {};

      for (const asset of assets) {
        if (asset.crown_jewel) {
          crownJewelsCount++;
        }
        if (asset.data_class) {
          dataClassBreakdown[asset.data_class] = (dataClassBreakdown[asset.data_class] || 0) + 1;
        }
        const hopKey = String(asset.hops);
        hopsBreakdown[hopKey] = (hopsBreakdown[hopKey] || 0) + 1;
      }

      const summary = `Blast radius for "${startNode}": ${assets.length} reachable assets across ${maxDepth} hops (${crownJewelsCount} Crown Jewels).`;

      return ToolResult.ok({
        startNode,
        maxDepth,
        totalAssetsReachable: assets.length,
        crownJewelsReachable: crownJewelsCount,
        dataClassBreakdown,
        hopsDistribution: hopsBreakdown,
        reachableAssets: assets,
      }, { summary });
    } catch (err) {
      return ToolResult.fail(err.message);
    }
  }
}
