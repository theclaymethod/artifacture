/**
 * Copy .d.ts files from svelte-package output to vite build output
 * This gives us proper Svelte component types while keeping bundled JS
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(__dirname, '..')
const sourceDir = path.join(packageDir, 'dist-types')
const targetDir = path.join(packageDir, 'dist')

function copyDtsFiles(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) {
        console.error(`Source directory not found: ${srcDir}`)
        return
    }

    const entries = fs.readdirSync(srcDir, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name)
        const destPath = path.join(destDir, entry.name)

        if (entry.isDirectory()) {
            // Ensure destination directory exists
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true })
            }
            copyDtsFiles(srcPath, destPath)
        } else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.ts.map')) {
            // Copy .d.ts and .d.ts.map files, overwriting existing
            fs.copyFileSync(srcPath, destPath)
        }
    }
}

// Copy types from svelte-package output to vite output
copyDtsFiles(sourceDir, targetDir)

// Count copied files for logging
function countDtsFiles(dir) {
    let count = 0
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.isDirectory()) {
            count += countDtsFiles(path.join(dir, entry.name))
        } else if (entry.name.endsWith('.d.ts')) {
            count++
        }
    }
    return count
}

const dtsCount = countDtsFiles(targetDir)
console.log(`✅ Copied ${dtsCount} type definition files from svelte-package`)
