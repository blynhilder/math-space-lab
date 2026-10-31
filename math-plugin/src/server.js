import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { z } from 'zod';

export const UI_URI = 'ui://math-lab/v1.html';
export const UI_MIME = 'text/html;profile=mcp-app';
export const UI_PATH = fileURLToPath(new URL('../public/math-lab.html', import.meta.url));
export const MODES = ['geometry', 'coordinates', 'matrix', 'crystal'];
const bounded = (min, max) => z.number().finite().min(min).max(max);
// Homogeneous arrays keep exact dimensions without tuple-style JSON Schema items,
// which ChatGPT rejects when validating an MCP tool descriptor.
const vector = (min, max) => z.array(bounded(min, max)).length(3);
export const stateSchemas = {
  geometry: z.object({
    type: z.enum(['quadratic', 'sphere', 'custom']).optional(),
    expression: z.string().trim().min(1).max(256).describe('custom 曲面 z=f(x,y) 的表达式，例如 sin(x)*cos(y)。界面进一步验证支持的数学语法。').optional(),
    a: bounded(-1, 1).optional(), b: bounded(-1, 1).optional(),
    c: bounded(-2, 2).describe('截面 y=c').optional(), r: bounded(0.5, 2).optional()
  }).strict(),
  coordinates: z.object({ point: vector(-2, 2).optional(), projections: z.boolean().optional() }).strict(),
  matrix: z.object({ matrix: z.array(vector(-3, 3)).length(3).optional(), vector: vector(-3, 3).optional() }).strict(),
  crystal: z.object({
    type: z.enum(['SC', 'BCC', 'FCC']).optional(), repeat: z.union([z.literal(1), z.literal(2)]).optional(),
    plane: z.enum(['none', '100', '110', '111']).optional(),
    selection: z.string().max(32).regex(/^(0|0\.5|1),(0|0\.5|1),(0|0\.5|1)$/).describe('原点晶胞中的格点坐标，例如 0.5,0.5,0.5；必须属于所选点阵。').optional()
  }).strict()
};
const stateSchema = z.union(Object.values(stateSchemas));
const inputSchema = z.object({
  mode: z.enum(MODES).describe('geometry=曲面与截面; coordinates=三维坐标; matrix=3×3线性变换; crystal=立方晶格'),
  state: stateSchema.describe('所选 mode 的可选参数；仅包含该场景的字段。未提供的字段使用默认值。').optional()
}).strict();
const outputSchema = z.object({ mode: z.enum(MODES), state: stateSchema }).strict();
const uiMetadata = { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } };

export function normalizeState(mode, input = {}) {
  const parsed = stateSchemas[mode].parse(input);
  if (mode === 'geometry') {
    const state = { type: 'quadratic', expression: 'sin(x)*cos(y)', a: 0.5, b: -0.5, c: 0.5, r: 1.5, ...parsed };
    for (const key of ['a', 'b', 'c', 'r']) state[key] = Math.round(state[key] * 20) / 20;
    return state;
  }
  if (mode === 'coordinates') return { point: (parsed.point || [1, 1, 1]).map(value => Math.round(value * 20) / 20), projections: parsed.projections ?? true };
  if (mode === 'matrix') return { matrix: parsed.matrix || [[1, 0.6, 0], [0, 1, 0.3], [0, 0, 1]], vector: parsed.vector || [1, 1, 1] };
  const state = { type: 'BCC', repeat: 1, plane: '110', ...parsed };
  state.selection ??= state.type === 'BCC' ? '0.5,0.5,0.5' : state.type === 'FCC' ? '0,0.5,0.5' : '1,1,1';
  const halves = state.selection.split(',').filter(value => value === '0.5').length;
  if (!(halves === 0 || (state.type === 'BCC' && halves === 3) || (state.type === 'FCC' && halves === 2))) {
    throw new Error('selection 不是所选晶格在原点晶胞内的格点。');
  }
  return state;
}

export function createMathMcpServer() {
  const server = new McpServer({ name: 'math-plugin', version: '0.1.0' });
  server.registerTool('open_math_lab', {
    title: '数学互动实验室',
    description: '打开或重新配置数学互动实验室。通过 mode 和 state 设置曲面公式与截面、三维点坐标、3×3 矩阵/向量、SC/BCC/FCC 晶格与晶面。geometry type=custom 可传 z=f(x,y) 的数学表达式；这不是任意程序执行器。用户可旋转图形并修改参数，再把当前状态交给 GPT 解释。每次调用返回完整配置，供宿主组件显示；不保证覆盖先前聊天卡片。仅数学和晶体几何，不进行物理模拟、不访问外部数据。',
    inputSchema,
    outputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: UI_URI } }
  }, async ({ mode, state: input }) => {
    let state;
    try { state = normalizeState(mode, input); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: '场景参数无效：' + error.message }] }; }
    try { await access(UI_PATH); }
    catch { return { isError: true, content: [{ type: 'text', text: '数学实验室 UI 尚未构建。请先生成 public/math-lab.html。' }] }; }
    return {
      content: [{ type: 'text', text: `数学实验室 ${mode} 场景配置：${JSON.stringify(state)}。可在界面交互调整；公式的定义域、语法或采样限制会显示在界面中。` }],
      structuredContent: { mode, state }
    };
  });
  server.registerResource('math-lab', UI_URI, {
    title: '数学互动实验室',
    description: '四个数学场景的离线 HTML 交互界面。',
    mimeType: UI_MIME,
    _meta: uiMetadata
  }, async () => ({
    contents: [{ uri: UI_URI, mimeType: UI_MIME, text: await readFile(UI_PATH, 'utf8'), _meta: uiMetadata }]
  }));
  return server;
}

export function createMathHttpApp() {
  const app = createMcpExpressApp({ host: '127.0.0.1' });
  // Local preview uses the same complete HTML that the MCP resource serves.
  app.get(['/', '/math-lab.html'], async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store').type('html').send(await readFile(UI_PATH, 'utf8'));
    } catch {
      res.status(503).type('text').send('UI not built: generate public/math-lab.html first.');
    }
  });
  app.get('/health', async (_req, res) => {
    let uiReady = true;
    try { await access(UI_PATH); } catch { uiReady = false; }
    res.json({ status: 'ok', uiReady, transport: 'streamable-http', authentication: 'none-local-development' });
  });
  app.post('/mcp', async (req, res) => {
    // Stateless official SDK transport: each request has its own protocol instance.
    const server = createMathMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error.message);
      if (!res.headersSent) res.status(500).json({ error: 'MCP request failed.' });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').send('Use MCP Streamable HTTP POST.'));
  return app;
}

export async function startServer({ host = '127.0.0.1', port = Number(process.env.PORT || 52184) } = {}) {
  if (host !== '127.0.0.1') throw new Error('This local development server only binds to 127.0.0.1.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 through 65535.');
  const app = createMathHttpApp();
  return await new Promise((resolveServer, reject) => {
    const listener = app.listen(port, host, () => resolveServer(listener));
    listener.once('error', reject);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const listener = await startServer();
  const address = listener.address();
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  console.log(`Math Lab preview: http://${hostname}:${address.port}/`);
  console.log(`MCP endpoint: http://${hostname}:${address.port}/mcp`);
  console.log('Local development server. No authentication; no ChatGPT account connection is configured.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => listener.close(() => process.exit(0)));
}
