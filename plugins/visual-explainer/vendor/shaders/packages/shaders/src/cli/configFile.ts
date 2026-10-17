// Reads/writes the project's shaders.config.{ts,js,mjs}.
//
// The file is ours and tiny, so it's read with a regex per string field
// rather than executing it (no TS loader in the CLI bundle). Anything that
// isn't a plain string literal for framework/project/outDir is ignored.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ShadersConfig, ShadersFramework } from '../config'

const CONFIG_FILENAMES = ['shaders.config.ts', 'shaders.config.mts', 'shaders.config.js', 'shaders.config.mjs']
const FRAMEWORKS: ShadersFramework[] = ['react', 'vue', 'svelte', 'solid']

const FIELD_COMMENTS: Record<'framework' | 'project' | 'outDir', (value: string) => string> = {
  framework: value => `Components are imported from 'shaders/${value}'`,
  project: () => 'Shaders project this codebase is connected to',
  outDir: () => 'Where `npx shaders install` writes component files'
}

export async function findConfigFile(dir: string): Promise<string | null> {
  for (const name of CONFIG_FILENAMES) {
    const file = path.join(dir, name)
    try {
      await readFile(file)
      return file
    } catch {
      // keep looking
    }
  }
  return null
}

export interface ConfigValues {
  framework: ShadersFramework | null
  project: string | null
  outDir: string | null
}

function readField(source: string, key: string): string | null {
  const match = new RegExp(`\\b${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`).exec(source)
  return match ? match[2] : null
}

export async function readConfig(file: string): Promise<ConfigValues> {
  const source = await readFile(file, 'utf8')
  const framework = readField(source, 'framework')
  return {
    framework: FRAMEWORKS.includes(framework as ShadersFramework) ? framework as ShadersFramework : null,
    project: readField(source, 'project'),
    outDir: readField(source, 'outDir')
  }
}

export function renderConfig(config: ShadersConfig): string {
  const lines = [
    `import { defineConfig } from 'shaders/config'`,
    ``,
    `export default defineConfig({`
  ]
  for (const key of ['framework', 'project', 'outDir'] as const) {
    const value = config[key]
    if (!value) continue
    lines.push(`  // ${FIELD_COMMENTS[key](value)}`, `  ${key}: '${value}',`)
  }
  lines.push(`})`, ``)
  return lines.join('\n')
}

export async function writeConfigFile(dir: string, config: ShadersConfig, usesTypeScript: boolean): Promise<string> {
  const file = path.join(dir, usesTypeScript ? 'shaders.config.ts' : 'shaders.config.js')
  await writeFile(file, renderConfig(config))
  return file
}

/**
 * Set one string field in an existing config. Replaces the field in place
 * when present, otherwise inserts it after the last known field inside the
 * defineConfig object. Returns false when the file has no recognisable
 * anchor (heavily hand-edited) so the caller can tell the user instead.
 */
export async function setConfigField(file: string, key: 'framework' | 'project' | 'outDir', value: string): Promise<boolean> {
  const source = await readFile(file, 'utf8')
  const fieldRe = new RegExp(`(\\b${key}\\s*:\\s*)(['"\`])[^'"\`]*\\2`)
  let next: string
  if (fieldRe.test(source)) {
    next = source.replace(fieldRe, `$1'${value}'`)
  } else {
    // Anchor on the last existing known field line
    const anchorRe = /^([ \t]*)(framework|project|outDir)\s*:\s*['"`][^'"`]*['"`],?[ \t]*$/gm
    let anchor: RegExpExecArray | null = null
    for (let m = anchorRe.exec(source); m; m = anchorRe.exec(source)) anchor = m
    if (!anchor) return false
    const indent = anchor[1]
    const anchorLine = anchor[0].trimEnd().endsWith(',') ? anchor[0] : anchor[0].trimEnd() + ','
    const insertion = `${anchorLine}\n${indent}// ${FIELD_COMMENTS[key](value)}\n${indent}${key}: '${value}',`
    next = source.slice(0, anchor.index) + insertion + source.slice(anchor.index + anchor[0].length)
  }
  await writeFile(file, next)
  return true
}
