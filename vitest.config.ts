import type { UserConfig } from 'vitest/config';

export default {
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/renderer/test/setup.ts'],
  },
} satisfies UserConfig;
