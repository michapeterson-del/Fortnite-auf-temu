// Bündelt die benötigten three.js-Erweiterungen (r160) zu vendor/three-addons.js.
// Einmalig: npm i three@0.160.0 esbuild; dann: node tools/build-addons.mjs
import * as esbuild from 'esbuild';
import path from 'node:path';
await esbuild.build({
  entryPoints: ['tools/addons-entry.js'], bundle: true, format: 'iife', minify: true, outfile: 'vendor/three-addons.js',
  plugins: [{ name: 'three-global', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: path.resolve('tools/three-shim.js') })); } }],
});
