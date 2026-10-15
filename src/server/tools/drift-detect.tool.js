import { IGraphTool, ToolResult } from './tool.interface.js';

export class DriftDetectTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'drift_detect';
    this.description = 'Detects if introducing a new edge or configuration change opens new lateral attack paths to Crown Jewels.';
    this.parameters = {
      type: 'object',
      properties: {
        newEdge: {
          type: 'object',
          description: 'The proposed edge to evaluate for security drift',
          properties: {
            from: { type: 'string', description: 'Source node ID' },
            to: { type: 'string', description: 'Target node ID' },
            type: { type: 'string', description: 'Relationship type (e.g. "CAN_ASSUME")' },
          },
          required: ['from', 'to', 'type'],
        },
        maxHops: {
          type: 'number',
          description: 'Maximum hops to check for attack paths (default: 6)',
        },
      },
      required: ['newEdge'],
    };
  }

  async execute(params, repository) {
    const { newEdge } = params;
    const maxHops = Math.min(Number(params?.maxHops) || 6, 12);

    if (!newEdge?.from || !newEdge?.to || !newEdge?.type) {
      return ToolResult.fail('Parameter "newEdge" must define "from", "to", and "type"');
    }

    try {
      // 1. Measure baseline paths from entrypoint nodes to Crown Jewels
      const baselineCypher = `
        MATCH (src), (target:CrownJewel)
        WHERE (src:PublicIP OR src:EC2Instance OR src:Internet)
        WITH target, shortestPath((src)-[*..${maxHops}]->(target)) AS p
        WHERE p IS NOT NULL
        RETURN count(p) AS baselineCount
      `;
      const baseRes = await repository.query(baselineCypher);
      const baselineCount = baseRes.data?.[0]?.baselineCount ?? 0;

      // 2. Add the hypothetical edge
      await repository.createEdge(newEdge.from, newEdge.to, newEdge.type, newEdge.properties || {});

      // 3. Measure post-drift paths
      const postDriftCypher = `
        MATCH (src), (target:CrownJewel)
        WHERE (src:PublicIP OR src:EC2Instance OR src:Internet)
        WITH target, shortestPath((src)-[*..${maxHops}]->(target)) AS p
        WHERE p IS NOT NULL
        RETURN count(p) AS newCount,
               collect([n IN nodes(p) | n.id])[0] AS sampleNewPath
      `;
      const postRes = await repository.query(postDriftCypher);
      const newCount = postRes.data?.[0]?.newCount ?? 0;
      const sampleNewPath = postRes.data?.[0]?.sampleNewPath || null;

      // 4. Always cleanly revert the temporary test edge!
      await repository.deleteEdge(newEdge.from, newEdge.to, newEdge.type);

      const pathsAdded = Math.max(0, newCount - baselineCount);
      const isDangerousDrift = pathsAdded > 0;

      const summary = isDangerousDrift
        ? `⚠️ CRITICAL DRIFT: Adding "${newEdge.from} -[:${newEdge.type}]-> ${newEdge.to}" opened ${pathsAdded} new attack path(s) to Crown Jewels!`
        : `✅ SAFE: Adding "${newEdge.from} -[:${newEdge.type}]-> ${newEdge.to}" does not open any new paths to Crown Jewels.`;

      return ToolResult.ok({
        testedEdge: newEdge,
        baselinePathCount: baselineCount,
        postDriftPathCount: newCount,
        newPathsCreated: pathsAdded,
        isDangerousDrift,
        sampleNewPath,
      }, { summary });
    } catch (err) {
      // Attempt cleanup on failure just in case
      await repository.deleteEdge(newEdge.from, newEdge.to, newEdge.type).catch(() => {});
      return ToolResult.fail(err.message);
    }
  }
}
