import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { server, startServer, closeConnection } from '../src/server/index.js';

describe('Phase 0: Server Initialization & Health Endpoint', () => {
  before(async () => {
    await startServer();
  });

  after(async () => {
    await closeConnection();
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/health returns 200 and reports FalkorDB connected', async () => {
    const port = server.address().port;
    const response = await fetch(`http://localhost:${port}/api/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'aegisgraph');
    assert.equal(body.falkordb?.connected, true);
    assert.equal(body.falkordb?.port, 6379);
  });
});
