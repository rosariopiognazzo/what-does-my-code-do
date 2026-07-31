import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['packages/cli/src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'packages/cli/dist',
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: true,
  noExternal: [/^@wdmcd\//],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  outExtension: () => ({ js: '.mjs' }),
});
