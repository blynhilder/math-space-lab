import { build } from 'esbuild';

await build({
  entryPoints: ['src/worker.js'], outfile: 'dist/server/index.js',
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  loader: { '.html': 'text' }, minify: true, legalComments: 'eof',
  conditions: ['workerd', 'worker', 'browser']
});
console.log('Built self-contained Math Lab Worker.');
