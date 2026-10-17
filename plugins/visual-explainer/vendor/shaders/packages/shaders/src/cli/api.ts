// Thin HTTP client for the shaders.com plugin API used by the CLI. The base
// URL is overridable for local dev (SHADERS_API_URL=http://localhost:3000).

export const DEFAULT_API_URL = 'https://shaders.com'

export function getApiUrl(): string {
  return (process.env.SHADERS_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> | null = null) {
    super(message)
    this.name = 'ApiError'
  }

  /** `upgrade_url` from a 403 body, when the server offered one. */
  get upgradeUrl(): string | null {
    const url = this.data?.upgrade_url
    return typeof url === 'string' ? url : null
  }

  /** Machine-readable `error` code from the body (e.g. `project_not_found`). */
  get code(): string | null {
    const code = this.data?.error
    return typeof code === 'string' ? code : null
  }

  get isProjectNotFound(): boolean {
    return this.code === 'project_not_found'
  }
}

/**
 * Something in Shaders the local project points at no longer exists.
 * Thrown with a plain-English message; `update` reports these separately
 * from real failures (the local file is untouched and nothing is broken).
 */
export class GoneError extends Error {
  constructor(message: string, public what: 'project' | 'shader' | 'preset') {
    super(message)
    this.name = 'GoneError'
  }
}

export function projectGone(projectId: string): GoneError {
  return new GoneError(
    `The connected Shaders project (${projectId}) isn't available to this account — it may have been deleted, or it belongs to a different account.\n  Run npx shaders connect to pick a different project, or npx shaders login to switch accounts.`,
    'project'
  )
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  token?: string
  body?: unknown
  query?: Record<string, string>
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, getApiUrl() + '/')
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
  } catch (error) {
    throw new ApiError(0, `Could not reach ${url.host} (${error instanceof Error ? error.message : String(error)})`)
  }

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message = data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
      ? (data as { message: string }).message
      : `${response.status} ${response.statusText}`
    throw new ApiError(response.status, message, data && typeof data === 'object' ? data as Record<string, unknown> : null)
  }

  return data as T
}
