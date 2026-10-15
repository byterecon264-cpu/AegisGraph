/**
 * Normalized graph payload representation produced by all ingestors.
 */
export class GraphPayload {
  constructor({ scenario_id, name, description, alert, nodes = [], edges = [], metadata = {} }) {
    this.scenario_id = scenario_id;
    this.name = name;
    this.description = description;
    this.alert = alert;
    this.nodes = nodes;
    this.edges = edges;
    this.metadata = metadata;
  }
}

/**
 * Base interface for all scenario ingestors (Factory / Strategy pattern).
 */
export class BaseIngestor {
  /**
   * Parses the raw scenario input and outputs a normalized GraphPayload.
   *
   * @param {string|object} source
   * @returns {Promise<GraphPayload>|GraphPayload}
   */
  parse(source) {
    throw new Error('parse() must be implemented by concrete ingestor');
  }
}
