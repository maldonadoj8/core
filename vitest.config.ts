import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/index.ts', 'src/**/types.ts'],
      thresholds: {
        statements: 95,
        branches: 93,
        functions: 90,
        lines: 95,
      },
    },
    setupFiles: [],
  },
});
