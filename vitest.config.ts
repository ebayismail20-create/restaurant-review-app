import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Required for @testing-library/react's automatic DOM cleanup between
    // tests (it registers itself via the global afterEach hook).
    globals: true,
  },
});
