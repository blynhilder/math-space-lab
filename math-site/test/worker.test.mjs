import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker from '../dist/server/index.js';

const url = 'https://math-lab.example';
const call = (path, init) => worker.fetch(new Request(url + path, init));

test('hosted HTML keeps the verified full interactive app unchanged', async () => {
  const response = await call('/');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), await readFile(new URL('../src/math-lab.html', import.meta.url), 'utf8'));
  assert.equal((await call('/health')).status, 200);
  assert.equal((await call('/favicon.svg')).headers.get('content-type'), 'image/svg+xml');
  assert.equal((await call('/unknown')).status, 404);
});

test('MCP rejects unsupported methods and malformed JSON without damaging later calls', async () => {
  for (const method of ['GET', 'DELETE']) assert.equal((await call('/mcp', { method })).status, 405);
  const response = await call('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{' });
  assert.equal(response.status, 400);
});

test('official SDK supports discovery, all four scenes, schema validation and full UI resources', async () => {
  const client = new Client({ name: 'math-site-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url + '/mcp'), { fetch: (input, init) => worker.fetch(new Request(input, init)) });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, 'math-space-lab');
    const { tools } = await client.listTools();
    assert.equal(tools.length, 1);
    const tool = tools[0];
    assert.equal(tool._meta.ui.resourceUri, 'ui://math-lab/v1.html');
    function checkSchema(node) {
      if (!node || typeof node !== 'object') return;
      assert.equal(Array.isArray(node.items), false, 'ChatGPT rejects tuple-style items');
      for (const value of Object.values(node)) checkSchema(value);
    }
    checkSchema(tool.inputSchema);
    checkSchema(tool.outputSchema);
    const scenes = [
      { mode: 'geometry', state: { type: 'custom', expression: 'sin(x)*cos(y)+a*x^2', a: 0.75 } },
      { mode: 'coordinates', state: { point: [1, -1, 0.5] } },
      { mode: 'matrix', state: { matrix: [[1, 1, 0], [0, 1, 0], [0, 0, 1]], vector: [1, 2, 3] } },
      { mode: 'crystal', state: { type: 'FCC', repeat: 2, plane: '111' } }
    ];
    const results = await Promise.all(scenes.map(arguments_ => client.callTool({ name: 'open_math_lab', arguments: arguments_ })));
    for (let i = 0; i < scenes.length; i++) {
      assert.notEqual(results[i].isError, true);
      assert.equal(results[i].structuredContent.mode, scenes[i].mode);
      for (const [key, value] of Object.entries(scenes[i].state)) assert.deepEqual(results[i].structuredContent.state[key], value);
    }
    for (const invalid of [
      { mode: 'matrix', state: { matrix: [[1, 2], [3, 4]] } },
      { mode: 'coordinates', state: { point: [1, 2, 99] } },
      { mode: 'crystal', state: { type: 'SC', selection: '0.5,0.5,0.5' } }
    ]) assert.equal((await client.callTool({ name: 'open_math_lab', arguments: invalid })).isError, true);
    const resource = await client.readResource({ uri: tool._meta.ui.resourceUri });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(resource.contents[0].text, /mathMcpBridge/);
    assert.match(resource.contents[0].text, /ml-geo-expression/);
    assert.deepEqual(resource.contents[0]._meta.ui.csp.connectDomains, []);
  } finally { await client.close(); }
});
