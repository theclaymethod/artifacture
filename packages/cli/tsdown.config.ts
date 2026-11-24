import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      '@artifacture/gpu',
      '@artifacture/gpu/node',
      '@artifacture/gpu/scenes',
      '@artifacture/kit',
      '@artifacture/themes',
      '@artifacture/verify',
    ],
  },
});
