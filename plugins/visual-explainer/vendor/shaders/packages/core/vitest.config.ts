import { defineConfig } from 'vitest/config'
import typegpu from 'unplugin-typegpu/vite'
import path from 'path'

export default defineConfig({
  // The TGSL transpiler must run under vitest so `'use gpu'` fragment/compute bodies are
  // transpiled before `tgpu.resolve` (the resolve-gate). vitest uses the vite plugin
  // pipeline, but this config is separate from the library build's vite.config.ts, so the
  // plugin has to be registered here too.
  plugins: [typegpu()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.test.ts',
        'src/v1/**',
        'src/telemetry/**'
      ],
      thresholds: {
        functions: 70,
        lines: 70,
        branches: 60
      }
    }
  },
  resolve: {
    alias: {
      '@coreroot': path.resolve(__dirname, './src')
    }
  }
})
