import { createShader } from './createShader'
import { decodePreviewDefinition } from './decode'
import type { PreviewInstance, PreviewOptions, KeyProp } from './types'
import type { PresetConfig, ComponentConfig } from 'shaders-core'

const DEFAULT_API_BASE = 'https://shaders.com'
const WATERMARK_TEXT = 'Unlock your Shaders Pro license'
const WATERMARK_LINK = 'https://shaders.com/dashboard?pricing=true'

// --- Configuration apply ---
// Mirrors the key-prop identification the design editor uses when it saves a
// preset. Inlined here because the build copies each framework dist into the
// published npm package and won't carry a cross-package import.

const RESERVED_IDENTIFIERS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'return',
  'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield',
])

function slugifyIdentifier(label: string, fallback: string): string {
  const cleaned = label.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  if (!cleaned) return fallback
  const parts = cleaned.split(/\s+/)
  const camel = parts
    .map((part, i) => i === 0 ? part.charAt(0).toLowerCase() + part.slice(1) : part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  const safe = /^[A-Za-z_$]/.test(camel) ? camel : `_${camel}`
  return RESERVED_IDENTIFIERS.has(safe) ? `_${safe}` : safe
}

function buildKeyPropIdentifierMap(keyProps: KeyProp[] | null | undefined): Map<string, KeyProp> {
  const used = new Set<string>(['style'])
  const map = new Map<string, KeyProp>()
  if (!keyProps?.length) return map
  keyProps.forEach((kp, i) => {
    if (!kp.targets?.length) return
    const base = slugifyIdentifier(kp.label, `keyProp${i}`)
    let ident = base
    let suffix = 1
    while (used.has(ident)) {
      suffix++
      ident = `${base}${suffix}`
    }
    used.add(ident)
    map.set(ident, kp)
  })
  return map
}

function findInTree(id: string, list: ComponentConfig[]): ComponentConfig | null {
  for (const c of list) {
    if (c.id === id) return c
    const children = (c as { children?: ComponentConfig[] }).children
    if (children?.length) {
      const hit = findInTree(id, children)
      if (hit) return hit
    }
  }
  return null
}

function applyConfigurationInPlace(
  components: ComponentConfig[],
  configuration: Record<string, unknown> | null | undefined,
  identMap: Map<string, KeyProp>
): void {
  if (!configuration) return
  for (const [ident, value] of Object.entries(configuration)) {
    const kp = identMap.get(ident)
    if (!kp) continue
    for (const t of kp.targets ?? []) {
      const comp = findInTree(t.component_id, components)
      if (comp?.props && t.prop in comp.props) (comp.props as Record<string, unknown>)[t.prop] = value
    }
  }
}

/**
 * Create a watermarked shader preview from a preview token or preset ID.
 * Fetches the encoded (and server-watermarked) definition from the API,
 * decodes it, renders it to the canvas, and adds a DOM watermark overlay.
 *
 * @example
 * ```ts
 * const preview = await createPreview(canvas, {
 *   presetId: 'abc123',
 *   configuration: { primaryColor: '#ff0000', intensity: 0.5 }
 * })
 *
 * // Update configuration at runtime (no refetch)
 * preview.setConfiguration({ primaryColor: '#00ff00', intensity: 0.8 })
 *
 * // Cleanup
 * preview.destroy()
 * ```
 */
export async function createPreview(
  canvas: HTMLCanvasElement,
  options: PreviewOptions
): Promise<PreviewInstance> {
  if ((!options.shader && !options.presetId) || (options.shader && options.presetId)) {
    throw new Error('Exactly one of shader (preview token) or presetId must be provided')
  }

  const apiBase = options.apiBaseUrl || DEFAULT_API_BASE
  // Version pins the preview to a snapshot; when omitted, the server returns
  // latest. Only meaningful on the presetId path.
  const versionParam = options.presetId && options.version
    ? `?version=${encodeURIComponent(options.version)}`
    : ''
  const url = options.shader
    ? `${apiBase}/api/preview/shader/${encodeURIComponent(options.shader)}`
    : `${apiBase}/api/preview/preset/${encodeURIComponent(options.presetId!)}${versionParam}`

  // Fetch the encoded definition (server has already injected the in-shader watermark)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch preview: ${response.status} ${response.statusText}`)
  }

  const payload = await response.json() as { preset?: { definition?: string; key_props?: KeyProp[] }; shader?: { definition?: string; key_props?: KeyProp[] } }
  const item = payload.preset ?? payload.shader
  if (!item?.definition || typeof item.definition !== 'string') {
    throw new Error('Preview response missing encoded definition')
  }

  const definition = decodePreviewDefinition(item.definition) as PresetConfig
  const keyProps = Array.isArray(item.key_props) ? item.key_props : null
  const identMap = buildKeyPropIdentifierMap(keyProps)

  // Capture authored baseline values BEFORE applying initial configuration, so
  // setConfiguration({}) (or any future call that omits a key) can revert that
  // target to its original value rather than leaving a stale override in
  // place. Mirrors the declarative semantics the framework Previews already
  // get for free via reactive recompute.
  const baselineMap = new Map<string, unknown>()
  for (const kp of identMap.values()) {
    for (const t of kp.targets ?? []) {
      const comp = findInTree(t.component_id, definition.components)
      if (comp?.props && t.prop in comp.props) {
        baselineMap.set(`${t.component_id}:${t.prop}`, (comp.props as Record<string, unknown>)[t.prop])
      }
    }
  }

  // Apply initial configuration to the decoded definition before render so the
  // first frame already reflects user values. Subsequent setConfiguration calls
  // route through instance.update() per target — no refetch, no full re-render.
  applyConfigurationInPlace(definition.components, options.configuration, identMap)

  const instance = await createShader(canvas, definition, {
    isPreview: true,
    enablePerformanceTracking: true
  })

  // Add DOM watermark overlay
  const { overlay, savedPosition, parentEl } = createWatermarkOverlay(canvas)

  // Extend destroy to also remove overlay and restore parent position
  const originalDestroy = instance.destroy.bind(instance)
  const previewInstance = instance as PreviewInstance
  previewInstance.destroy = () => {
    if (parentEl && savedPosition !== undefined) {
      parentEl.style.position = savedPosition
    }
    overlay.remove()
    originalDestroy()
  }

  previewInstance.setConfiguration = (configuration: Record<string, unknown>) => {
    if (!keyProps?.length) return
    // Replay the FULL target set on every call: targets whose identifier is
    // present in `configuration` get the new value; targets whose identifier
    // is omitted get reset to the captured baseline. Without this, a partial
    // call would leave previously-set keys stuck at their old override —
    // diverging from the declarative semantics of the framework Previews.
    for (const [ident, kp] of identMap) {
      const hasNewValue = Object.prototype.hasOwnProperty.call(configuration, ident)
        && configuration[ident] !== undefined
      for (const t of kp.targets ?? []) {
        const value = hasNewValue
          ? configuration[ident]
          : baselineMap.get(`${t.component_id}:${t.prop}`)
        if (value === undefined) continue
        instance.update(t.component_id, { [t.prop]: value })
      }
    }
  }

  return previewInstance
}

function createWatermarkOverlay(canvas: HTMLCanvasElement): {
  overlay: HTMLAnchorElement
  savedPosition: string | undefined
  parentEl: HTMLElement | null
} {
  // Ensure the canvas parent has position for absolute positioning
  const parent = canvas.parentElement
  let savedPosition: string | undefined
  if (parent) {
    const parentPosition = getComputedStyle(parent).position
    if (parentPosition === 'static') {
      savedPosition = parent.style.position
      parent.style.position = 'relative'
    }
  }

  const link = document.createElement('a')
  link.href = WATERMARK_LINK
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = WATERMARK_TEXT
  Object.assign(link.style, {
    position: 'absolute',
    bottom: '8px',
    right: '12px',
    fontSize: '11px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: 'rgba(255, 255, 255, 0.5)',
    textDecoration: 'none',
    zIndex: '10',
    pointerEvents: 'auto',
    transition: 'color 0.2s ease'
  })

  link.addEventListener('mouseenter', () => {
    link.style.color = 'rgba(255, 255, 255, 0.8)'
  })
  link.addEventListener('mouseleave', () => {
    link.style.color = 'rgba(255, 255, 255, 0.5)'
  })

  // Insert after canvas in the same parent
  if (parent) {
    parent.appendChild(link)
  }

  return { overlay: link, savedPosition, parentEl: parent }
}
