import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = new URL(process.argv[2] || '');
assert.equal(endpoint.protocol, 'https:', 'Pass the public HTTPS MCP endpoint as the first argument.');
assert.equal(endpoint.pathname, '/mcp', 'Expected the /mcp endpoint.');
const started = Date.now();
const client = new Client({ name: 'math-lab-remote-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(endpoint, {
  fetch: (input, init = {}) => fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000)
  })
});

try {
  await client.connect(transport);
  assert.equal(client.getServerVersion().name, 'math-plugin');
  console.log('PASS remote SDK initialization');

  const { tools } = await client.listTools();
  const tool = tools.find(item => item.name === 'open_math_lab');
  assert.ok(tool, 'Remote server must expose open_math_lab.');
  assert.equal(tool._meta.ui.resourceUri, 'ui://math-lab/v1.html');
  console.log('PASS remote tool discovery and UI metadata');

  const result = await client.callTool({
    name: 'open_math_lab',
    arguments: {
      mode: 'geometry',
      state: { type: 'custom', expression: 'sin(x)*cos(y)+a*x^2', a: 0.75, b: -0.5, c: -1.25 }
    }
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  assert.equal(result.structuredContent.mode, 'geometry');
  assert.equal(result.structuredContent.state.type, 'custom');
  assert.equal(result.structuredContent.state.expression, 'sin(x)*cos(y)+a*x^2');
  assert.equal(result.structuredContent.state.a, 0.75);
  assert.equal(result.structuredContent.state.c, -1.25);
  console.log('PASS remote custom formula tool invocation');

  const { contents } = await client.readResource({ uri: tool._meta.ui.resourceUri });
  assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.match(contents[0].text, /<!doctype html>/i);
  assert.match(contents[0].text, /mathMcpBridge/);
  assert.match(contents[0].text, /ml-geo-expression/);
  assert.deepEqual(contents[0]._meta.ui.csp.connectDomains, []);
  console.log('PASS remote complete HTML resource (' + Buffer.byteLength(contents[0].text) + ' bytes)');
  console.log('Remote MCP smoke succeeded in ' + (Date.now() - started) + ' ms.');
} finally {
  await client.close();
}
