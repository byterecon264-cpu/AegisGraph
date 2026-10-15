import { JSONIngestor } from './json.ingestor.js';

export class IngestorFactory {
  static #registry = new Map([
    ['json', JSONIngestor],
  ]);

  /**
   * Registers a new ingestor class for a given format string.
   *
   * @param {string} format
   * @param {new () => import('./ingestor.interface.js').BaseIngestor} IngestorClass
   */
  static register(format, IngestorClass) {
    this.#registry.set(format.toLowerCase(), IngestorClass);
  }

  /**
   * Instantiates an ingestor for the specified format.
   *
   * @param {string} [format='json']
   * @returns {import('./ingestor.interface.js').BaseIngestor}
   */
  static getIngestor(format = 'json') {
    const key = format.toLowerCase();
    const IngestorClass = this.#registry.get(key);
    if (!IngestorClass) {
      throw new Error(`IngestorFactory: Unsupported format "${format}". Available: ${[...this.#registry.keys()].join(', ')}`);
    }
    return new IngestorClass();
  }

  /**
   * Convenience static method to parse input directly.
   *
   * @param {string|object} source
   * @param {string} [format='json']
   * @returns {import('./ingestor.interface.js').GraphPayload}
   */
  static parse(source, format = 'json') {
    return this.getIngestor(format).parse(source);
  }
}
