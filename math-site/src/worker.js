import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMathMcpServer } from './math-server.js';
import html from './math-lab.html';

const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#152638"/><path d="M13 43 32 53 52 41V19L32 9 13 21Zm0-22 19 10 20-12M32 31v22" fill="none" stroke="#67e8cb" stroke-width="4" stroke-linejoin="round"/></svg>';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') {
      if (request.method !== 'POST') return new Response('Use MCP Streamable HTTP POST.', { status: 405, headers: { Allow: 'POST' } });
      // Sites applies owner-only authentication at its edge. No account data is
      // stored here: every call computes only from the supplied math parameters.
      const server = createMathMcpServer(html);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await server.connect(transport);
        return await transport.handleRequest(request);
      } catch (error) {
        console.error('Math MCP request failed:', error instanceof Error ? error.message : 'unknown error');
        return Response.json({ error: 'MCP request failed.' }, { status: 500 });
      } finally {
        await server.close().catch(() => {});
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    if (url.pathname === '/' || url.pathname === '/math-lab.html') return new Response(request.method === 'HEAD' ? null : html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } });
    if (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg') return new Response(request.method === 'HEAD' ? null : favicon, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
    if (url.pathname === '/health') return Response.json({ status: 'ok', uiReady: true, transport: 'streamable-http', deployment: 'cloud-worker', version: '0.2.0' });
    return new Response('Not found', { status: 404 });
  }
};
