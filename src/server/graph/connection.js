import { FalkorDB } from 'falkordb';
import 'dotenv/config';

/**
 * FalkorDB connection configuration loaded from environment variables.
 */
export const dbConfig = {
  host: process.env.FALKORDB_HOST || 'localhost',
  port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
  graphName: process.env.FALKORDB_GRAPH || 'aegisgraph',
  password: process.env.FALKORDB_PASSWORD || undefined,
};

let clientInstance = null;

/**
 * Returns a connected FalkorDB client instance (singleton).
 *
 * @param {object} [customOptions={}]
 * @returns {Promise<FalkorDB>}
 */
export async function getFalkorClient(customOptions = {}) {
  if (clientInstance) {
    return clientInstance;
  }

  const connectionOptions = {
    host: customOptions.host || dbConfig.host,
    port: customOptions.port || dbConfig.port,
    ...(dbConfig.password ? { password: dbConfig.password } : {}),
    ...customOptions,
  };

  try {
    clientInstance = await FalkorDB.connect(connectionOptions);
    return clientInstance;
  } catch (error) {
    clientInstance = null;
    throw new Error(
      `Failed to connect to FalkorDB at ${connectionOptions.host}:${connectionOptions.port} - ${error.message}`
    );
  }
}

/**
 * Selects and returns a Graph handle for the given or default graph name.
 *
 * @param {string} [graphName=dbConfig.graphName]
 * @returns {Promise<import('falkordb').Graph>}
 */
export async function getGraph(graphName = dbConfig.graphName) {
  const client = await getFalkorClient();
  return client.selectGraph(graphName);
}

/**
 * Closes the FalkorDB connection and resets the singleton instance.
 *
 * @returns {Promise<void>}
 */
export async function closeConnection() {
  if (clientInstance) {
    try {
      await clientInstance.close();
    } finally {
      clientInstance = null;
    }
  }
}
