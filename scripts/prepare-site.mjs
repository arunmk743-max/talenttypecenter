import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('dist/assets', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await build({ entryPoints: ['web/central-store.js'], outfile: 'dist/assets/central-store.js', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true });
