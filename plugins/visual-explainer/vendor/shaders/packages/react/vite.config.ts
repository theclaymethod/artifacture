import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts';
import {externalizeDeps} from 'vite-plugin-externalize-deps';
import { resolve } from 'path';
import fs from 'fs';

function getPackageVersion(): string {
  const shadersPkgPath = resolve(__dirname, '../shaders/package.json')
  const frameworkPkgPath = resolve(__dirname, 'package.json')
  if (fs.existsSync(shadersPkgPath)) {
    try {
      const shadersPkg = JSON.parse(fs.readFileSync(shadersPkgPath, 'utf-8'))
      return shadersPkg.version
    } catch (_) { /* fall through */ }
  }
  try {
    return JSON.parse(fs.readFileSync(frameworkPkgPath, 'utf-8')).version
  } catch (_) {
    return '0.0.0'
  }
}

export default defineConfig({
    plugins: [
        externalizeDeps({
            except: ['colorjs.io'] // Bundled in core, not a peer dependency
        }),
        // @ts-ignore
        react({
            // Ensure JSX compatibility for both React 18 and 19
            jsxRuntime: 'automatic',
            jsxImportSource: 'react'
        }),
        dts({
            include: ['src'],
            beforeWriteFile: (filePath, content) => {
                // Calculate the correct relative path to core based on file depth
                // Files in dist/react/ need ../core, files in dist/react/components/ need ../../core
                const transformedPath = filePath.replace('/src/', '/')
                const afterDist = transformedPath.split('/dist/')[1] || ''
                const depth = afterDist.split('/').length - 1 // -1 for the filename itself
                const relativePath = '../' + '../'.repeat(depth) + 'core'

                // Rewrite shaders-core imports to relative paths
                // Note: shaders-core/ShaderName maps to dist/shaders/ShaderName in core package
                // but shaders-core and shaders-core/telemetry map directly to dist/
                content = content.replace(
                    /from ['"]shaders-core\/telemetry['"]/g,
                    `from '${relativePath}/telemetry'`
                )
                content = content.replace(
                    /from ['"]shaders-core\/([^'"]+)['"]/g,
                    `from '${relativePath}/shaders/$1'`
                )
                content = content.replace(
                    /from ['"]shaders-core['"]/g,
                    `from '${relativePath}'`
                )
                content = content.replace(
                    /import\(['"]shaders-core\/telemetry['"]\)/g,
                    `import('${relativePath}/telemetry')`
                )
                content = content.replace(
                    /import\(['"]shaders-core\/([^'"]+)['"]\)/g,
                    `import('${relativePath}/shaders/$1')`
                )
                content = content.replace(
                    /import\(['"]shaders-core['"]\)/g,
                    `import('${relativePath}')`
                )

                return {
                    filePath: transformedPath,
                    content,
                }
            },
        }),
    ],
    build: {
        // Target ES2020 for broader browser compatibility while supporting React 18
        target: 'es2020',
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                'utils/generatePresetCode': resolve(__dirname, 'src/utils/generatePresetCode.ts')
            },
            formats: ['es'],
            fileName: (_format, entryName) => {
                if (entryName === 'utils/generatePresetCode') {
                    return 'utils/generatePresetCode.js';
                }
                return `${entryName}.js`;
            }
        },
        rollupOptions: {
            output: {
                preserveModules: true,
                preserveModulesRoot: 'src',
                exports: 'named'
            }
        },
        rolldownOptions: {
            output: {
                preserveModules: true,
                preserveModulesRoot: 'src',
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react/jsx-runtime': 'jsxRuntime'
                },
                exports: 'named'
            },
        },
        // Avoid advanced optimizations that might break in different React versions
        minify: false,
        sourcemap: false,
        // Prevent inlining of dynamic imports
        assetsInlineLimit: 0
    },
    // Use environment variables to distinguish between React versions during build
    define: {
        '__REACT_VERSION_CHECK__': false,
        __SHADERS_VERSION__: JSON.stringify(getPackageVersion())
    }
})
