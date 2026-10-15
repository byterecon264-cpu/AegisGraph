import { IGraphTool, ToolResult } from './tool.interface.js';

export class ShortestPathTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'shortest_path';
    this.description = 'Finds the shortest directed attack paths between a source asset and a target or all Crown Jewels in the infrastructure.';
    this.parameters = {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'The source node ID (e.g., "i-0abc123" or "role/WebServerRole")',
        },
        target: {
          type: 'string',
          description: 'Optional target node ID or "CrownJewel" to target all high-value assets. Defaults to "CrownJewel".',
        },
        maxHops: {
          type: 'number',
          description: 'Maximum hops to traverse (default: 6, max: 15)',
        },
      },
      required: ['source'],
    };
  }

  async execute(params, repository) {
    const source = params.source;
    const target = params.target || 'CrownJewel';
    const maxHops = Math.min(Number(params.maxHops) || 6, 15);

    if (!source || typeof source !== 'string') {
      return ToolResult.fail('Parameter "source" is required');
    }

    try {
      if (target === 'CrownJewel' || target === '*') {
        const paths = await repository.findPathsToCrownJewels(source, maxHops);
        return ToolResult.ok(paths, {
          summary: `Discovered ${paths.length} attack path(s) from "${source}" to Crown Jewels (within ${maxHops} hops).`,
        });
      }

      const singlePath = await repository.shortestPath(source, target, maxHops);
      if (!singlePath) {
        return ToolResult.ok(null, {
          summary: `No path found from "${source}" to "${target}" within ${maxHops} hops.`,
        });
      }

      return ToolResult.ok(singlePath, {
        summary: `Found shortest path of ${singlePath.hops} hops from "${source}" to "${target}".`,
      });
    } catch (err) {
      return ToolResult.fail(err.message);
    }
  }
}
