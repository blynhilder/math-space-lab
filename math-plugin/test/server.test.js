import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServer, UI_URI, UI_MIME, UI_PATH } from '../src/server.js';

// Exercise the actual HTTP transport and SDK handshake, not direct handler calls.
let listener;
let client;
let origin;
before(async () => {
  listener = await startServer({ port: 0 });
  origin = `http://127.0.0.1:${listener.address().port}`;
  client = new Client({ name: 'math-lab-integration-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
});
after(async () => {
  await client?.close();
  if (listener) await new Promise((resolve, reject) => {
    listener.close(error => error ? reject(error) : resolve());
    listener.closeAllConnections();
  });
});

const call = (mode, state) => client.callTool({ name: 'open_math_lab', arguments: { mode, ...(state === undefined ? {} : { state }) } });
const successful = result => {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  assert.ok(result.structuredContent, 'A rendered scene needs structured content');
  assert.ok(result.content.some(part => part.type === 'text' && part.text.length > 0));
  return result.structuredContent;
};

test('SDK initialize negotiates the actual server and tool/resource capabilities', () => {
  assert.equal(client.getServerVersion().name, 'math-plugin');
  assert.ok(client.getServerCapabilities().tools);
  assert.ok(client.getServerCapabilities().resources);
});

test('listTools advertises one bounded, read-only MCP App with input/output schemas', async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  const tool = tools[0];
  assert.equal(tool.name, 'open_math_lab');
  assert.equal(tool._meta.ui.resourceUri, UI_URI);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.deepEqual(tool.inputSchema.properties.mode.enum, ['geometry', 'coordinates', 'matrix', 'crystal']);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.ok(tool.outputSchema.properties.state);
});

test('wire schemas use homogeneous array items and preserve exact 3D dimensions', async () => {
  const { tools: [tool] } = await client.listTools();
  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'array') {
      // ChatGPT tool schemas accept an item schema, not draft-07 tuple arrays.
      assert.equal(Array.isArray(node.items), false, `${path}.items must be one schema`);
      assert.equal(typeof node.items, 'object', `${path}.items must exist`);
      assert.equal(node.prefixItems, undefined, `${path} must not use tuple prefixItems`);
      assert.equal(node.minItems, 3, `${path} must require exactly three entries`);
      assert.equal(node.maxItems, 3, `${path} must require exactly three entries`);
    }
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) value.forEach((child, i) => visit(child, `${path}.${key}[${i}]`));
      else if (value && typeof value === 'object') visit(value, `${path}.${key}`);
    }
  };
  visit(tool.inputSchema, 'inputSchema');
  visit(tool.outputSchema, 'outputSchema');
  for (const schema of [tool.inputSchema, tool.outputSchema]) {
    const coordinate = schema.properties.state.anyOf.find(state => state.properties.point);
    assert.deepEqual(coordinate.properties.point.items, { type: 'number', minimum: -2, maximum: 2 });
    const matrix = schema.properties.state.anyOf.find(state => state.properties.matrix);
    assert.deepEqual(matrix.properties.matrix.items.items, { type: 'number', minimum: -3, maximum: 3 });
  }
});

test('geometry default scene returns complete parameters', async () => {
  const scene = successful(await call('geometry'));
  assert.equal(scene.mode, 'geometry');
  assert.equal(scene.state.type, 'quadratic');
  assert.equal(scene.state.a, 0.5);
  assert.equal(scene.state.b, -0.5);
  assert.equal(scene.state.c, 0.5);
});

test('custom surface expression and section are delivered intact through MCP', async () => {
  const scene = successful(await call('geometry', { type: 'custom', expression: 'sin(x)*cos(y)+a*x^2', a: 0.75, c: -1.25 }));
  assert.equal(scene.state.type, 'custom');
  assert.equal(scene.state.expression, 'sin(x)*cos(y)+a*x^2');
  assert.equal(scene.state.a, 0.75);
  assert.equal(scene.state.c, -1.25);
});

test('coordinate scene supports negative coordinates and disabled projections', async () => {
  const scene = successful(await call('coordinates', { point: [-2, 0.5, 1.75], projections: false }));
  assert.equal(scene.mode, 'coordinates');
  assert.deepEqual(scene.state, { point: [-2, 0.5, 1.75], projections: false });
});

test('matrix scene retains row-major matrix and vector, including singular transformations', async () => {
  const matrix = [[2, 0, 0], [0, -1, 0.5], [0, 0, 0]];
  const vector = [1, -2, 3];
  const scene = successful(await call('matrix', { matrix, vector }));
  assert.equal(scene.mode, 'matrix');
  assert.deepEqual(scene.state, { matrix, vector });
});

test('FCC crystal supports 2×2×2 cells, the (111) plane, and a face-center selection', async () => {
  const scene = successful(await call('crystal', { type: 'FCC', repeat: 2, plane: '111', selection: '0,0.5,0.5' }));
  assert.equal(scene.mode, 'crystal');
  assert.deepEqual(scene.state, { type: 'FCC', repeat: 2, plane: '111', selection: '0,0.5,0.5' });
});

test('resource discovery and readResource return the same complete local HTML', async () => {
  const { resources } = await client.listResources();
  assert.equal(resources.length, 1);
  assert.equal(resources[0].uri, UI_URI);
  assert.equal(resources[0].mimeType, UI_MIME);
  const { contents } = await client.readResource({ uri: UI_URI });
  assert.equal(contents.length, 1);
  assert.equal(contents[0].mimeType, UI_MIME);
  assert.equal(contents[0].text, await readFile(UI_PATH, 'utf8'));
  assert.match(contents[0].text, /<!doctype html>/i);
  assert.match(contents[0].text, /mathMcpBridge/);
  assert.deepEqual(contents[0]._meta.ui.csp.connectDomains, []);
  assert.deepEqual(contents[0]._meta.ui.csp.resourceDomains, []);
});

test('bad schemas and incompatible scene state fail as MCP tool errors', async t => {
  const invalid = [
    ['unknown scene', { mode: 'physics' }],
    ['missing mode', {}],
    ['unrecognized top-level field', { mode: 'geometry', runCode: '1+1' }],
    ['blank expression', { mode: 'geometry', state: { type: 'custom', expression: ' ' } }],
    ['overlong expression', { mode: 'geometry', state: { expression: 'x'.repeat(257) } }],
    ['out-of-bounds coordinate', { mode: 'coordinates', state: { point: [3, 0, 0] } }],
    ['wrong vector dimension', { mode: 'matrix', state: { vector: [1, 2] } }],
    ['extra coordinate dimension', { mode: 'coordinates', state: { point: [0, 0, 0, 0] } }],
    ['wrong matrix row count', { mode: 'matrix', state: { matrix: [[1, 0, 0], [0, 1, 0]] } }],
    ['ragged matrix', { mode: 'matrix', state: { matrix: [[1, 0], [0, 1, 0], [0, 0, 1]] } }],
    ['matrix entry outside range', { mode: 'matrix', state: { matrix: [[4, 0, 0], [0, 1, 0], [0, 0, 1]] } }],
    ['unknown state field', { mode: 'geometry', state: { source: 'external' } }],
    ['coordinates state in matrix mode', { mode: 'matrix', state: { point: [0, 0, 0] } }],
    ['unsupported crystal repetition', { mode: 'crystal', state: { repeat: 3 } }],
    ['FCC selection in BCC', { mode: 'crystal', state: { type: 'BCC', selection: '0,0.5,0.5' } }]
  ];
  for (const [name, args] of invalid) await t.test(name, async () => {
    const result = await client.callTool({ name: 'open_math_lab', arguments: args });
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(result.structuredContent, undefined);
    assert.ok(result.content.some(part => part.type === 'text' && part.text.length > 0));
  });
});

test('health, preview, and HTTP method handling are available locally', async () => {
  assert.deepEqual(await (await fetch(`${origin}/health`)).json(), {
    status: 'ok', uiReady: true, transport: 'streamable-http', authentication: 'none-local-development'
  });
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(await page.text(), await readFile(UI_PATH, 'utf8'));
  const wrongMethod = await fetch(`${origin}/mcp`);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
});
