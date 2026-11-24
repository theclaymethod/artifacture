import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      '@artifacture/gpu',
      '@artifacture/gpu/node',
      '@artifacture/kit',
      'pixelmatch',
      'playwright',
      'pngjs',
    ],
  },
});
