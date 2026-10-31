import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: [fileURLToPath(new URL('../src/bridge.js', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/bridge.js', import.meta.url)),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  legalComments: 'inline',
  logLevel: 'info'
});
