export interface PartnerPresetComponent {
  type: string
  id?: string
  props?: Record<string, unknown>
  children?: PartnerPresetComponent[]
}

export interface PartnerPresetDefinition {
  components: PartnerPresetComponent[]
  structureVersion?: number
  colorSpace?: string
  devicePreview?: string
}

/**
 * Top-level groupings the dotcom catalogues shaders under. Pass to
 * `listPresets({ categories })` to narrow the response. Omit to receive every
 * category.
 */
export type CollectionCategory = 'background' | 'logo' | 'image-effects'

export interface PartnerCollection {
  id: string
  name: string
  slug: string
  /** Top-level grouping. Useful when partners want to render section
   *  headings or filter the list further client-side. */
  category: CollectionCategory
}

export type PartnerPresetLabel = 'gradient' | 'geometric' | 'organic' | 'glowing' | 'textured' | 'retro' | '3d' | 'minimal' | 'vibrant' | 'dark' | 'calm' | 'dramatic'

export interface PartnerKeyPropTarget {
  component_id: string
  prop: string
}

export interface PartnerKeyProp {
  label: string
  type: 'color' | 'range' | 'logo'
  category?: string
  targets: PartnerKeyPropTarget[]
}

export interface PartnerPreset {
  id: string
  collection: PartnerCollection | null
  definition: PartnerPresetDefinition
  thumbnail_url: string | null
  visual_description: string | null
  primary_colors: string[] | null
  color_hex_codes: string[] | null
  labels: PartnerPresetLabel[] | null
  key_props: PartnerKeyProp[] | null
  created_at: string
  updated_at: string
}

export interface PartnerPagination {
  page: number
  limit: number
  total: number
  has_more: boolean
}

export interface PartnerListPresetsResponse {
  presets: PartnerPreset[]
  pagination: PartnerPagination
}

export interface PartnerClientOptions {
  apiKey: string
  baseUrl?: string
}

export interface ListPresetsOptions {
  page?: number
  limit?: number
  /**
   * Restrict the response to one or more categories. Omit to receive every
   * category (the default — what you want for a general-purpose integration).
   * Supply a subset (e.g. `['logo']`) when the integration only renders one
   * kind of shader, so you don't pull rows you'll never show.
   */
  categories?: CollectionCategory[]
}

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const DEFAULT_BASE_URL = 'https://shaders.com'
const CACHE_TTL_MS = 5 * 60 * 1000

export class PartnerClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly cache = new Map<string, CacheEntry<unknown>>()

  constructor(options: PartnerClientOptions) {
    if (!options.apiKey) throw new Error('PartnerClient requires an apiKey')
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data
  }

  private setCached<T>(key: string, data: T): void {
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  }

  async listPresets(options: ListPresetsOptions = {}): Promise<PartnerListPresetsResponse> {
    const page = Math.max(1, options.page ?? 1)
    const limit = Math.min(100, Math.max(1, options.limit ?? 20))
    // Normalize categories for both the request and the cache key. Sorting +
    // dedup means `['logo','background']` and `['background','logo']` share a
    // cache entry and don't double the cache footprint.
    const categories = options.categories && options.categories.length > 0
      ? [...new Set(options.categories)].sort()
      : null
    const cacheKey = `presets:p${page}:l${limit}:c${categories?.join(',') ?? '*'}`

    const cached = this.getCached<PartnerListPresetsResponse>(cacheKey)
    if (cached) return cached

    const url = new URL(`${this.baseUrl}/api/partner/v1/presets`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('limit', String(limit))
    if (categories) {
      url.searchParams.set('categories', categories.join(','))
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })

    if (!response.ok) {
      let message = response.statusText
      try {
        const body = await response.json() as { message?: string }
        if (body.message) message = body.message
      } catch {}
      throw new Error(`Partner API error ${response.status}: ${message}`)
    }

    const data = await response.json() as PartnerListPresetsResponse
    this.setCached(cacheKey, data)
    return data
  }

  /**
   * Generate an SDF (signed distance field) `.bin` file from raw SVG content.
   * Resolves to the file's bytes as a `Uint8Array` — the caller can write it
   * to disk, upload it to their own CDN, or feed it straight into a shader
   * component that consumes SDF buffers.
   *
   * Backed by the public `/api/plugin/sdf/generate` endpoint, which is shared
   * with the Framer plugin. The endpoint is anonymous (no API key required);
   * Vercel-side rate limits apply. Maximum input size: 5 MB of SVG text.
   *
   * Not cached — the same SVG fed in twice will round-trip twice. Memoize
   * upstream if you need to.
   *
   * @example
   * ```ts
   * const fs = await import('node:fs/promises')
   * const svg = await fs.readFile('./logo.svg', 'utf8')
   * const sdf = await client.generateSdf(svg)
   * await fs.writeFile('./logo.sdf.bin', sdf)
   * ```
   */
  async generateSdf(
    svg: string,
    options: { timeoutMs?: number } = {}
  ): Promise<Uint8Array> {
    if (typeof svg !== 'string' || svg.length === 0) {
      throw new Error('generateSdf requires a non-empty SVG string')
    }

    // 30s default covers all but pathological SVGs without leaving callers
    // hanging forever when the network or upstream stalls. The single
    // AbortController covers the request *and* the body-stream read so we
    // can't get stuck after headers arrive but before the bytes do.
    const timeoutMs = options.timeoutMs ?? 30_000
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${this.baseUrl}/api/plugin/sdf/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svg }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // The endpoint returns JSON errors but bytes on success — read defensively.
        let message = response.statusText
        try {
          const body = await response.json() as { message?: string; error?: string }
          if (body.message) message = body.message
          else if (body.error) message = body.error
        } catch {}
        throw new Error(`SDF generation failed ${response.status}: ${message}`)
      }

      const buffer = await response.arrayBuffer()
      return new Uint8Array(buffer)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`SDF generation timed out after ${timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timeoutHandle)
    }
  }
}
