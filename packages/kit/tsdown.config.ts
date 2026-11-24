import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    highlight: 'src/highlight.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'shiki',
      'd3-dag',
      '@artifacture/themes',
    ],
  },
});
