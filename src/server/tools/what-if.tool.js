import { IGraphTool, ToolResult } from './tool.interface.js';

export class WhatIfTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'what_if_simulate';
    this.description = 'Simulates a proposed edge revocation or isolation without permanently mutating the graph, comparing attack paths before and after.';
    this.parameters = {
      type: 'object',
      properties: {
        removeEdge: {
          type: 'object',
          description: 'The edge to simulate removing',
          properties: {
            from: { type: 'string', description: 'Source node ID of the edge' },
            to: { type: 'string', description: 'Target node ID of the edge' },
            type: { type: 'string', description: 'Optional relationship type (e.g. "CAN_ASSUME")' },
          },
          required: ['from', 'to'],
        },
        sourceNode: {
          type: 'string',
          description: 'Optional entrypoint node ID to test from. If omitted, checks all public or compromised nodes.',
        },
        targetNode: {
          type: 'string',
          description: 'Optional target node ID. Defaults to all Crown Jewels.',
        },
        maxHops: {
          type: 'number',
          description: 'Maximum hops to evaluate (default: 6)',
        },
      },
      required: ['removeEdge'],
    };
  }

  async execute(params, repository) {
    const { removeEdge, sourceNode, targetNode } = params;
    const maxHops = Math.min(Number(params?.maxHops) || 6, 12);

    if (!removeEdge?.from || !removeEdge?.to) {
      return ToolResult.fail('Parameter "removeEdge" must include "from" and "to" node IDs');
    }

    try {
      const fromLiteral = JSON.stringify(removeEdge.from);
      const toLiteral = JSON.stringify(removeEdge.to);
      const typeCondition = removeEdge.type
        ? `AND type(r) = ${JSON.stringify(removeEdge.type)}`
        : '';

      const srcMatch = sourceNode
        ? `(src {id: ${JSON.stringify(sourceNode)}})`
        : `(src)`;

      const dstMatch = targetNode && targetNode !== 'CrownJewel'
        ? `(dst {id: ${JSON.stringify(targetNode)}})`
        : `(dst:CrownJewel)`;

      const baseSrcWhere = sourceNode
        ? `src <> dst`
        : `src <> dst AND (src:PublicIP OR src:EC2Instance OR src:Internet OR src:IAMRole OR src:IAMUser)`;

      // 1. Count paths BEFORE simulated cut
      const beforeCypher = `
        MATCH ${srcMatch}, ${dstMatch}
        WHERE ${baseSrcWhere}
        MATCH p = (src)-[*1..${maxHops}]->(dst)
        RETURN count(p) AS pathsBefore
      `;
      const beforeRes = await repository.query(beforeCypher);
      const pathsBefore = beforeRes.data?.[0]?.pathsBefore ?? 0;

      // 2. Count paths AFTER simulated cut using NONE() filter
      const afterCypher = `
        MATCH ${srcMatch}, ${dstMatch}
        WHERE ${baseSrcWhere}
        MATCH p = (src)-[*1..${maxHops}]->(dst)
        WHERE NONE(r IN relationships(p) WHERE startNode(r).id = ${fromLiteral} AND endNode(r).id = ${toLiteral} ${typeCondition})
        RETURN count(p) AS pathsAfter
      `;
      const afterRes = await repository.query(afterCypher);
      const pathsAfter = afterRes.data?.[0]?.pathsAfter ?? 0;

      const pathReduction = pathsBefore - pathsAfter;
      const reductionPercentage = pathsBefore > 0
        ? Number(((pathReduction / pathsBefore) * 100).toFixed(1))
        : 100;
      const threatEliminated = pathsAfter === 0;

      const summary = `What-If simulation: revoking "${removeEdge.from} -> ${removeEdge.to}" reduces attack paths from ${pathsBefore} to ${pathsAfter} (${reductionPercentage}% reduction). Threat eliminated: ${threatEliminated ? 'YES ✅' : 'NO ⚠️'}.`;

      return ToolResult.ok({
        simulatedCut: removeEdge,
        pathsBefore,
        pathsAfter,
        pathReduction,
        reductionPercentage,
        threatEliminated,
      }, { summary, cypherQuery: afterCypher });
    } catch (err) {
      return ToolResult.fail(err.message);
    }
  }
}
