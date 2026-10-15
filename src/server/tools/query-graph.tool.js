import { IGraphTool, ToolResult } from './tool.interface.js';

export class QueryGraphTool extends IGraphTool {
  constructor() {
    super();
    this.name = 'query_graph';
    this.description = 'Executes a custom openCypher query directly against FalkorDB to inspect entities, relationships, or subgraphs.';
    this.parameters = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The openCypher query string to execute (e.g. "MATCH (n:IAMRole) RETURN n.id, n.name LIMIT 10")',
        },
      },
      required: ['query'],
    };
  }

  async execute(params, repository) {
    if (!params.query || typeof params.query !== 'string') {
      return ToolResult.fail('Parameter "query" must be a non-empty string');
    }

    try {
      const result = await repository.query(params.query);
      return ToolResult.ok(result.data || [], {
        cypherQuery: params.query,
        summary: `Executed Cypher query returning ${result.data?.length || 0} rows.`,
      });
    } catch (err) {
      return ToolResult.fail(err.message, { cypherQuery: params.query });
    }
  }
}
