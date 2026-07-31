import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@wdmcd/analyzer-ts': fileURLToPath(
        new URL('./packages/analyzer-ts/src/index.ts', import.meta.url),
      ),
      '@wdmcd/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@wdmcd/impact': fileURLToPath(new URL('./packages/impact/src/index.ts', import.meta.url)),
      '@wdmcd/renderers': fileURLToPath(
        new URL('./packages/renderers/src/index.ts', import.meta.url),
      ),
      '@wdmcd/semantic-rules': fileURLToPath(
        new URL('./packages/semantic-rules/src/index.ts', import.meta.url),
      ),
      '@wdmcd/store': fileURLToPath(new URL('./packages/store/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
