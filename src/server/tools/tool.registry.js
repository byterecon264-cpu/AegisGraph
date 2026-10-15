import { QueryGraphTool } from './query-graph.tool.js';
import { ShortestPathTool } from './shortest-path.tool.js';
import { BlastRadiusTool } from './blast-radius.tool.js';
import { CentralityTool } from './centrality.tool.js';
import { PageRankTool } from './pagerank.tool.js';
import { WhatIfTool } from './what-if.tool.js';
import { DriftDetectTool } from './drift-detect.tool.js';

/**
 * ToolRegistry implements the Strategy Pattern & MCP tool broker for AegisGraph.
 */
export class ToolRegistry {
  #tools = new Map();

  /**
   * Registers an IGraphTool instance.
   *
   * @param {import('./tool.interface.js').IGraphTool} tool
   */
  register(tool) {
    if (!tool.name) {
      throw new Error('Tool must have a valid name');
    }
    this.#tools.set(tool.name, tool);
  }

  /**
   * Retrieves a tool by name.
   *
   * @param {string} name
   * @returns {import('./tool.interface.js').IGraphTool|null}
   */
  get(name) {
    return this.#tools.get(name) || null;
  }

  /**
   * Returns all registered tools.
   *
   * @returns {Array<import('./tool.interface.js').IGraphTool>}
   */
  listAll() {
    return Array.from(this.#tools.values());
  }

  /**
   * Executes a tool by name.
   *
   * @param {string} name
   * @param {object} params
   * @param {import('../graph/repository.js').GraphRepository} repository
   * @returns {Promise<import('./tool.interface.js').ToolResult>}
   */
  async execute(name, params, repository) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered in ToolRegistry. Available: ${[...this.#tools.keys()].join(', ')}`);
    }
    return tool.execute(params, repository);
  }

  /**
   * Exports tool definitions in Model Context Protocol (MCP) format.
   *
   * @returns {Array<{ name: string, description: string, inputSchema: object }>}
   */
  toMCPSchemas() {
    return this.listAll().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
    }));
  }

  /**
   * Exports tool definitions in OpenAI Function Calling format.
   *
   * @returns {Array<{ type: 'function', function: { name: string, description: string, parameters: object } }>}
   */
  toOpenAITools() {
    return this.listAll().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Factory method providing a pre-loaded registry with all 7 core tools.
   *
   * @returns {ToolRegistry}
   */
  static createDefaultRegistry() {
    const registry = new ToolRegistry();
    registry.register(new QueryGraphTool());
    registry.register(new ShortestPathTool());
    registry.register(new BlastRadiusTool());
    registry.register(new CentralityTool());
    registry.register(new PageRankTool());
    registry.register(new WhatIfTool());
    registry.register(new DriftDetectTool());
    return registry;
  }
}
