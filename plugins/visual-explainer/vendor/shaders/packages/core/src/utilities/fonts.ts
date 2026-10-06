/**
 * Google Fonts runtime loading.
 *
 * Loads any Google font at runtime by injecting a css2 stylesheet link — no API key needed
 * (the Webfonts API key is only required for enumerating the catalog, which dotcom proxies
 * server-side). Generalizes the inline loader pattern from the Ascii shader.
 */

/** Builds a Google Fonts css2 URL for a single family/weight/italic combination. */
export function googleFontCss2Url(family: string, weight: number = 400, italic: boolean = false, text?: string): string {
    const fam = family.trim().replace(/ /g, '+')
    let url = `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`
    if (text) url += `&text=${encodeURIComponent(text)}`
    return url
}

// Dedupe: fonts that have finished loading, and loads currently in flight.
const loadedFonts = new Set<string>()
const pendingLoads = new Map<string, Promise<void>>()

/**
 * Loads a Google font (family + weight + italic) and resolves once the browser has it.
 * Safe to call repeatedly — concurrent and repeat calls share one load. If the requested
 * weight/style isn't published for the family (css2 responds 400), retries at regular 400
 * and lets the browser synthesize bold/oblique.
 */
export function loadGoogleFont(family: string, weight: number = 400, italic: boolean = false): Promise<void> {
    if (typeof document === 'undefined' || !family) return Promise.resolve()

    const key = `${family}|${weight}|${italic}`
    if (loadedFonts.has(key)) return Promise.resolve()
    const pending = pendingLoads.get(key)
    if (pending) return pending

    const promise = loadFontLink(family, weight, italic)
        .catch(() => {
            // Unavailable weight/style → fall back to regular 400 so the browser can synthesize.
            if (weight !== 400 || italic) return loadGoogleFont(family, 400, false)
        })
        .then(() => {
            loadedFonts.add(key)
            pendingLoads.delete(key)
        })
    pendingLoads.set(key, promise)
    return promise
}

function loadFontLink(family: string, weight: number, italic: boolean): Promise<void> {
    const href = googleFontCss2Url(family, weight, italic)

    const linkLoaded = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`link[href="${href}"]`)
        if (existing) {
            resolve()
            return
        }
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = href
        link.onload = () => resolve()
        link.onerror = () => {
            link.remove()
            reject(new Error(`Failed to load font stylesheet: ${family}`))
        }
        document.head.appendChild(link)
    })

    return linkLoaded.then(async () => {
        if (document.fonts?.load) {
            const spec = `${italic ? 'italic ' : ''}${weight} 12px "${family}"`
            try {
                const faces = await document.fonts.load(spec)
                if (!faces.length) throw new Error(`No font faces loaded for ${spec}`)
            } catch (e) {
                // fonts.load can throw on odd specs; retry the bare form before giving up
                const faces = await document.fonts.load(`12px "${family}"`)
                if (!faces.length) throw e
            }
            // Brief settle so the glyph data is actually usable for canvas raster (Ascii pattern)
            await new Promise(resolve => setTimeout(resolve, 300))
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    })
}

/** Whether the browser already has this font available (cheap, for cache keying). */
export function isFontAvailable(family: string, weight: number = 400, italic: boolean = false): boolean {
    if (typeof document === 'undefined' || !document.fonts?.check) return false
    try {
        return document.fonts.check(`${italic ? 'italic ' : ''}${weight} 12px "${family}"`)
    } catch {
        return false
    }
}
