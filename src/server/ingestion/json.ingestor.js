import { BaseIngestor, GraphPayload } from './ingestor.interface.js';

const SENSITIVE_DATA_CLASSES = new Set(['PII', 'financial', 'credential', 'PHI']);

export class JSONIngestor extends BaseIngestor {
  /**
   * Parses JSON string or JavaScript object into a normalized GraphPayload.
   *
   * @param {string|object} source
   * @returns {GraphPayload}
   */
  parse(source) {
    let data;
    if (typeof source === 'string') {
      try {
        data = JSON.parse(source);
      } catch (err) {
        throw new Error(`JSONIngestor: Failed to parse scenario JSON string - ${err.message}`);
      }
    } else if (typeof source === 'object' && source !== null) {
      data = source;
    } else {
      throw new TypeError(`JSONIngestor: Expected string or object input, received ${typeof source}`);
    }

    if (!data.scenario_id || typeof data.scenario_id !== 'string') {
      throw new Error('JSONIngestor: Scenario must define a valid "scenario_id"');
    }

    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      throw new Error('JSONIngestor: Scenario must define "nodes" and "edges" arrays');
    }

    const normalizedNodes = this.#normalizeNodes(data.nodes);
    const normalizedEdges = this.#normalizeEdges(data.edges, normalizedNodes);

    return new GraphPayload({
      scenario_id: data.scenario_id,
      name: data.name || data.scenario_id,
      description: data.description || '',
      alert: data.alert || null,
      metadata: data.metadata || {},
      nodes: normalizedNodes,
      edges: normalizedEdges,
    });
  }

  #normalizeNodes(rawNodes) {
    const nodeIds = new Set();

    return rawNodes.map((raw, idx) => {
      if (!raw.id || typeof raw.id !== 'string') {
        throw new Error(`JSONIngestor: Node at index ${idx} is missing a string "id"`);
      }
      if (!raw.label || typeof raw.label !== 'string') {
        throw new Error(`JSONIngestor: Node "${raw.id}" is missing a string "label"`);
      }

      if (nodeIds.has(raw.id)) {
        throw new Error(`JSONIngestor: Duplicate node id "${raw.id}" detected`);
      }
      nodeIds.add(raw.id);

      const dataClass = raw.data_class || raw.properties?.data_class || null;
      const isCrownJewel = Boolean(
        raw.crown_jewel ||
        (dataClass && SENSITIVE_DATA_CLASSES.has(dataClass))
      );

      const labels = [this.#sanitizeIdentifier(raw.label)];
      if (isCrownJewel && !labels.includes('CrownJewel')) {
        labels.push('CrownJewel');
      }

      const properties = {
        id: raw.id,
        name: raw.name || raw.id,
        crown_jewel: isCrownJewel,
        ...(dataClass ? { data_class: dataClass } : {}),
        ...(Array.isArray(raw.cves) ? { cves: raw.cves } : {}),
        ...(Array.isArray(raw.compliance_violations) ? { compliance_violations: raw.compliance_violations } : {}),
        ...(raw.properties || {}),
      };

      return {
        id: raw.id,
        primaryLabel: labels[0],
        labels,
        name: properties.name,
        isCrownJewel,
        dataClass,
        cves: properties.cves || [],
        complianceViolations: properties.compliance_violations || [],
        properties,
      };
    });
  }

  #normalizeEdges(rawEdges, normalizedNodes) {
    const validNodeIds = new Set(normalizedNodes.map((n) => n.id));

    return rawEdges.map((raw, idx) => {
      if (!raw.from || typeof raw.from !== 'string') {
        throw new Error(`JSONIngestor: Edge at index ${idx} is missing a string "from" reference`);
      }
      if (!raw.to || typeof raw.to !== 'string') {
        throw new Error(`JSONIngestor: Edge at index ${idx} is missing a string "to" reference`);
      }
      if (!raw.type || typeof raw.type !== 'string') {
        throw new Error(`JSONIngestor: Edge ${raw.from} -> ${raw.to} is missing "type"`);
      }

      if (!validNodeIds.has(raw.from)) {
        throw new Error(`JSONIngestor: Edge references unknown source node "${raw.from}"`);
      }
      if (!validNodeIds.has(raw.to)) {
        throw new Error(`JSONIngestor: Edge references unknown target node "${raw.to}"`);
      }

      const relationshipType = this.#sanitizeIdentifier(raw.type).toUpperCase();

      const properties = {
        ...(Array.isArray(raw.actions) ? { actions: raw.actions } : {}),
        ...(raw.protocol ? { protocol: raw.protocol } : {}),
        ...(raw.port !== undefined ? { port: raw.port } : {}),
        ...(raw.condition ? { condition: raw.condition } : {}),
        ...(raw.created_at ? { created_at: raw.created_at } : {}),
        ...(raw.properties || {}),
      };

      return {
        from: raw.from,
        to: raw.to,
        type: relationshipType,
        properties,
      };
    });
  }

  #sanitizeIdentifier(identifier) {
    return identifier.replace(/[^a-zA-Z0-9_]/g, '');
  }
}
