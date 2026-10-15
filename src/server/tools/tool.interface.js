/**
 * Abstract interface for all FalkorDB graph algorithm tools (Strategy Pattern & MCP-ready).
 */
export class IGraphTool {
  /**
   * Unique name identifier for the tool.
   * @type {string}
   */
  name = '';

  /**
   * Description explaining what the tool computes and when the agent should invoke it.
   * @type {string}
   */
  description = '';

  /**
   * JSON Schema describing the input parameters expected by this tool.
   * @type {object}
   */
  parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  /**
   * Executes the tool strategy using the provided repository.
   *
   * @param {object} params - Input arguments matching `this.parameters`
   * @param {import('../graph/repository.js').GraphRepository} repository - Data access layer
   * @returns {Promise<ToolResult>}
   */
  async execute(params, repository) {
    throw new Error(`execute() not implemented on tool ${this.name}`);
  }
}

/**
 * Standardized result payload returned by every tool.
 */
export class ToolResult {
  /**
   * @param {boolean} success
   * @param {any} data
   * @param {object} [metadata]
   */
  constructor(success, data, metadata = {}) {
    this.success = success;
    this.data = data;
    this.cypherQuery = metadata.cypherQuery || null;
    this.summary = metadata.summary || '';
    this.error = metadata.error || null;
    this.timestamp = new Date().toISOString();
  }

  static ok(data, metadata = {}) {
    return new ToolResult(true, data, metadata);
  }

  static fail(errorMessage, metadata = {}) {
    return new ToolResult(false, null, { ...metadata, error: errorMessage });
  }
}
