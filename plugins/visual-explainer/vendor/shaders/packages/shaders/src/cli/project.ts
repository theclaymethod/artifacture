// Shared "where am I and what's configured" resolution for install/update.
import { consola } from 'consola'
import { defaultOutDir, detectProject, type DetectedProject } from './detect'
import { findConfigFile, readConfig, setConfigField } from './configFile'
import type { ShadersFramework } from '../config'

export interface ProjectContext {
  detected: DetectedProject
  configFile: string
  framework: ShadersFramework
  project: string | null
  outDir: string
}

/** True when a shaders.config exists for the project containing `cwd`. */
export async function hasProjectConfig(cwd: string): Promise<boolean> {
  const detected = await detectProject(cwd)
  return !!detected && !!(await findConfigFile(detected.dir))
}

export async function resolveProjectContext(cwd: string): Promise<ProjectContext> {
  const detected = await detectProject(cwd)
  if (!detected) {
    throw new Error(`No package.json found in ${cwd} or its parents. Run this from inside your project.`)
  }
  const configFile = await findConfigFile(detected.dir)
  if (!configFile) {
    throw new Error(`No shaders.config found in ${detected.dir}. Run npx shaders connect first.`)
  }

  const config = await readConfig(configFile)
  const framework = config.framework ?? detected.library
  if (!framework) {
    throw new Error(`Couldn't read a framework from ${configFile}. Set framework: 'react' | 'vue' | 'svelte' | 'solid'.`)
  }

  // Configs written before `outDir` existed: pick the framework default and
  // persist it so the choice is visible and editable.
  let outDir = config.outDir
  if (!outDir) {
    outDir = defaultOutDir(detected.dir, detected.framework)
    if (await setConfigField(configFile, 'outDir', outDir)) {
      consola.info(`Added outDir: '${outDir}' to your shaders config`)
    }
  }

  return { detected, configFile, framework, project: config.project, outDir }
}
