#!/usr/bin/env tsx
import sharp from 'sharp'
import { resolve } from 'path'
import fs from 'fs'

interface OptimizationStats {
  processed: number
  skipped: number
  failed: number
  originalSize: number
  optimizedSize: number
}

export async function optimizeCovers(shadersDir: string): Promise<OptimizationStats> {
  const stats: OptimizationStats = {
    processed: 0,
    skipped: 0,
    failed: 0,
    originalSize: 0,
    optimizedSize: 0
  }

  const shaderDirs = fs.readdirSync(shadersDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  for (const shaderName of shaderDirs) {
    const coverPath = resolve(shadersDir, shaderName, 'cover.jpg')

    if (!fs.existsSync(coverPath)) {
      continue
    }

    try {
      // Check if already optimized (512x512)
      const metadata = await sharp(coverPath).metadata()

      if (metadata.width === 512 && metadata.height === 512) {
        stats.skipped++
        continue
      }

      // Get original file size
      const originalStats = fs.statSync(coverPath)
      stats.originalSize += originalStats.size

      // Create temporary file path
      const tempPath = coverPath.replace('.jpg', '.tmp.jpg')

      // Optimize and save to temp file
      await sharp(coverPath)
        .resize(512, 512, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 80,
          progressive: true
        })
        .toFile(tempPath)

      // Get optimized file size
      const optimizedStats = fs.statSync(tempPath)
      stats.optimizedSize += optimizedStats.size

      // Replace original with optimized
      fs.renameSync(tempPath, coverPath)

      const sizeDiff = originalStats.size - optimizedStats.size
      const percentSaved = ((sizeDiff / originalStats.size) * 100).toFixed(1)

      console.log(`  ✅ ${shaderName.padEnd(25)} ${formatBytes(originalStats.size)} → ${formatBytes(optimizedStats.size)} (${percentSaved}% smaller)`)

      stats.processed++
    } catch (error) {
      console.error(`  ❌ Failed to optimize ${shaderName}:`, error instanceof Error ? error.message : error)
      stats.failed++
    }
  }

  return stats
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  const coreDir = resolve(process.argv[1], '../..')
  const shadersDir = resolve(coreDir, 'src/shaders')

  console.log('🖼️  Optimizing cover images...\n')

  optimizeCovers(shadersDir)
    .then(stats => {
      if (stats.processed > 0 || stats.skipped > 0) {
        console.log('\n' + '='.repeat(80))
        console.log(`✨ Optimization complete!`)
        console.log(`📊 Processed: ${stats.processed} optimized, ${stats.skipped} skipped, ${stats.failed} failed`)

        if (stats.processed > 0) {
          const totalSaved = stats.originalSize - stats.optimizedSize
          const totalPercentSaved = ((totalSaved / stats.originalSize) * 100).toFixed(1)
          console.log(`💾 Total size: ${formatBytes(stats.originalSize)} → ${formatBytes(stats.optimizedSize)}`)
          console.log(`🎉 Saved: ${formatBytes(totalSaved)} (${totalPercentSaved}% reduction)`)
        }

        console.log('='.repeat(80))
      } else {
        console.log('ℹ️  No images found to optimize')
      }
    })
    .catch(error => {
      console.error('Error:', error)
      process.exit(1)
    })
}
