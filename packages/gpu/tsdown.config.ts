import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'node/index': 'src/node/index.ts',
    'scenes/index': 'src/scenes/index.ts',
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
      'vgpu',
      'vgpu/node',
      'vgpu/mock',
      '@vgpu/wgsl',
      '@vgpu/wgsl/runtime',
      '@vgpu/wgsl/prepare',
      '@vgpu/wgsl/loader-vite',
      'pngjs',
    ],
  },
});
