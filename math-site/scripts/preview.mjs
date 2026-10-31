import { createServer } from 'node:http';
import worker from '../dist/server/index.js';

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1:52186${req.url}`, {
      method: req.method, headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {})
    });
    const response = await worker.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
server.listen(52186, '127.0.0.1', () => console.log('Math Site preview: http://127.0.0.1:52186/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
