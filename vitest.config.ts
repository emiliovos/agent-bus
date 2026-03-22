import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 10_000,
    include: ['tests/**/*.test.ts'],
    exclude: ['claw3d/**', 'node_modules/**'],
  },
});
