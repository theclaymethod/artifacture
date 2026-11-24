import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const singleFile = process.env.SINGLEFILE === '1';

export default defineConfig({
  plugins: [
    wgslVitePlugin(),
    { enforce: 'pre', ...mdx() },
    react(),
    tailwindcss(),
    ...(singleFile ? [viteSingleFile()] : []),
  ],
  build: {
    outDir: singleFile ? 'dist-singlefile' : 'dist',
    emptyOutDir: true,
  },
});
