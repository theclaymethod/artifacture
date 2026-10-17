// `npx shaders open` — open the connected shaders.com project in the design editor.
import { consola } from 'consola'
import { api, ApiError, getApiUrl, projectGone } from './api'
import { getSignedInState, openBrowser } from './auth'
import { resolveProjectContext } from './project'

export async function open(): Promise<void> {
  const ctx = await resolveProjectContext(process.cwd())
  if (!ctx.project) {
    throw new Error('This codebase isn\'t connected to a Shaders project yet. Run npx shaders connect to set one up.')
  }

  // When we can (stored sign-in), make sure the project still exists so a
  // deleted one gets a clear message instead of a 404 page in the browser.
  // Signed out: just open the URL — the site handles auth from there.
  try {
    const state = await getSignedInState()
    if (state) {
      const { projects } = await api<{ projects: { id: string }[] }>('/api/plugin/projects', {
        token: state.credentials.accessToken,
        query: { id: ctx.project, limit: '1' }
      })
      if (!projects.some(p => p.id === ctx.project)) throw projectGone(ctx.project)
    }
  } catch (error) {
    // API trouble (including while checking the sign-in itself) shouldn't
    // block opening a URL we already know. A deleted project is a GoneError,
    // not an ApiError, so it still surfaces.
    if (!(error instanceof ApiError)) throw error
  }

  const url = `${getApiUrl()}/design-editor/${ctx.project}`
  consola.log(url)
  openBrowser(url)
}
