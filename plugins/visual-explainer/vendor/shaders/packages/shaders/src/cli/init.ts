// `npx shaders connect` — set up Shaders in a downstream project:
//   1. detect the framework from package.json
//   2. install the `shaders` package with the project's package manager
//   3. write shaders.config.ts
//   4. sign in and connect the codebase to a shaders.com project
import path from 'node:path'
import { consola } from 'consola'
import { addDependency, detectPackageManager } from 'nypm'
import { api } from './api'
import { ensureSignedIn, type Credentials } from './auth'
import { findConfigFile, setConfigField, writeConfigFile } from './configFile'
import { defaultOutDir, describeDetection, detectProject, LIBRARY_LABELS, type DetectedProject, type Library } from './detect'

export interface InitFlags {
  yes: boolean
  auth: boolean
  install: boolean
  project?: string
  framework?: string
}

export interface ProjectSummary {
  id: string
  title: string
  updated_at: string
  shader_count: number
}

const CANCEL = Symbol.for('cancel')
const LIBRARIES = Object.keys(LIBRARY_LABELS) as Library[]

export function isInteractive(flags: { yes: boolean }): boolean {
  return !flags.yes && !!process.stdout.isTTY && !!process.stdin.isTTY
}

export function cancelled(): never {
  consola.log('Cancelled.')
  process.exit(0)
}

async function resolveLibrary(detected: DetectedProject, flags: InitFlags): Promise<Library> {
  if (flags.framework) {
    if (!LIBRARIES.includes(flags.framework as Library)) {
      throw new Error(`Unknown framework "${flags.framework}". Use one of: ${LIBRARIES.join(', ')}`)
    }
    return flags.framework as Library
  }
  if (detected.library) return detected.library

  if (!isInteractive(flags)) {
    throw new Error(`Couldn't detect a UI framework in ${path.join(detected.dir, 'package.json')}. Pass one with --framework <${LIBRARIES.join('|')}>`)
  }
  const choice = await consola.prompt('Which framework does this project use?', {
    type: 'select',
    options: LIBRARIES.map(value => ({ value, label: LIBRARY_LABELS[value] })),
    cancel: 'symbol'
  })
  if ((choice as unknown) === CANCEL) cancelled()
  return choice as Library
}

async function installPackage(detected: DetectedProject, flags: InitFlags): Promise<void> {
  if (detected.shadersVersion) {
    consola.success(`shaders already installed (${detected.shadersVersion})`)
    return
  }
  if (!flags.install) {
    consola.info('Skipped installing shaders (--no-install)')
    return
  }
  // No lockfile yet (fresh scaffold) → nypm can't detect; fall back to npm.
  const pm = (await detectPackageManager(detected.dir))?.name ?? 'npm'
  consola.start(`Installing shaders with ${pm}…`)
  try {
    await addDependency('shaders', { cwd: detected.dir, silent: true, packageManager: pm })
  } catch (error) {
    throw new Error(`Failed to install shaders: ${error instanceof Error ? error.message : String(error)}\nInstall it manually, then re-run npx shaders connect`)
  }
  consola.success('Installed shaders')
}

function relative(dir: string, file: string): string {
  return path.relative(dir, file) || path.basename(file)
}

export async function chooseProject(credentials: Credentials, detected: DetectedProject, flags: InitFlags): Promise<ProjectSummary | null> {
  if (flags.project) {
    const { projects } = await api<{ projects: ProjectSummary[] }>('/api/plugin/projects', { token: credentials.accessToken, query: { id: flags.project, limit: '1' } })
    const found = projects.find(p => p.id === flags.project)
    if (!found) throw new Error(`Project ${flags.project} isn't in your account — it may have been deleted. Run npx shaders connect without --project to pick one.`)
    return found
  }

  if (!isInteractive(flags)) {
    consola.info('Skipped connecting a project — pass --project <id> to connect non-interactively')
    return null
  }

  const { projects } = await api<{ projects: ProjectSummary[] }>('/api/plugin/projects', { token: credentials.accessToken, query: { limit: '100' } })

  const NEW = '__new__'
  const options = [
    { value: NEW, label: projects.length ? 'Create a new project' : 'Create a new project (you have none yet)' },
    ...projects.map(p => ({
      value: p.id,
      label: p.title || 'Untitled Project',
      hint: `${p.shader_count} shader${p.shader_count === 1 ? '' : 's'}`
    }))
  ]
  const choice = await consola.prompt('Which project should this codebase connect to?', {
    type: 'select',
    options,
    cancel: 'symbol'
  })
  if ((choice as unknown) === CANCEL) cancelled()

  if (choice !== NEW) {
    return projects.find(p => p.id === choice) ?? null
  }

  const defaultTitle = typeof detected.pkg.name === 'string' && detected.pkg.name
    ? detected.pkg.name.replace(/^@[^/]+\//, '')
    : path.basename(detected.dir)
  const title = await consola.prompt('Project name', { type: 'text', default: defaultTitle, placeholder: defaultTitle, cancel: 'symbol' })
  if ((title as unknown) === CANCEL) cancelled()

  const created = await api<{ id: string, title: string }>('/api/plugin/projects', {
    method: 'POST',
    token: credentials.accessToken,
    body: { title: (title as string) || defaultTitle }
  })
  return { id: created.id, title: created.title, updated_at: new Date().toISOString(), shader_count: 0 }
}

export async function init(flags: InitFlags): Promise<void> {
  const cwd = process.cwd()
  const detected = await detectProject(cwd)
  if (!detected) {
    throw new Error(`No package.json found in ${cwd} or its parents. Run npx shaders connect from inside your project.`)
  }

  const library = await resolveLibrary(detected, flags)
  consola.log(`Detected: ${describeDetection(detected.framework, library)}`)

  await installPackage(detected, flags)

  let configFile = await findConfigFile(detected.dir)
  if (configFile) {
    consola.success(`Found ${relative(detected.dir, configFile)}`)
  }

  let projectId: string | null = null
  let projectTitle: string | null = null
  if (flags.auth) {
    const { credentials, me } = await ensureSignedIn()
    consola.success(`Signed in${me.email ? ` as ${me.email}` : ''}`)
    const project = await chooseProject(credentials, detected, flags)
    if (project) {
      projectId = project.id
      projectTitle = project.title
    }
  } else {
    consola.info('Skipped sign-in (--no-auth)')
  }

  if (!configFile) {
    const outDir = defaultOutDir(detected.dir, detected.framework)
    configFile = await writeConfigFile(detected.dir, { framework: library, project: projectId ?? undefined, outDir }, detected.usesTypeScript)
    consola.success(`Created ${relative(detected.dir, configFile)} (components will install to ${outDir}/)`)
  } else if (projectId) {
    const updated = await setConfigField(configFile, 'project', projectId)
    if (!updated) {
      consola.warn(`Couldn't update ${relative(detected.dir, configFile)} automatically — add project: '${projectId}' to it`)
    }
  }

  if (projectId) {
    consola.success(`Connected project to Shaders${projectTitle ? ` (${projectTitle})` : ''}`)
  }
}
