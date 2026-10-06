import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      beforeWriteFile: (filePath, content) => ({
        filePath: filePath.replace('/src/', '/'),
        content,
      }),
    }),
  ],
  build: {
    minify: false,
    lib: {
      entry: { index: resolve(__dirname, 'src/index.ts') },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        exports: 'named',
      },
    },
  },
})
