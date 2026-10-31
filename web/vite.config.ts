import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Preenche a lista de arquivos e a versão do service worker depois do build. */
function precache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'vida-precache',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (name !== 'sw.js') files.push(relative(outDir, full));
        }
      };
      walk(outDir);
      const urls = ['./', ...files.map((f) => `./${f}`)].sort();
      let hash = 0;
      for (const f of files) for (const b of readFileSync(join(outDir, f))) hash = (hash * 31 + b) >>> 0;
      const sw = join(outDir, 'sw.js');
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__PRECACHE__', JSON.stringify(urls)).replace('__VERSION__', hash.toString(36)));
    },
  };
}

export default defineConfig({
  // Caminhos relativos: o app funciona em qualquer subpasta (GitHub Pages).
  base: './',
  plugins: [precache()],
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
