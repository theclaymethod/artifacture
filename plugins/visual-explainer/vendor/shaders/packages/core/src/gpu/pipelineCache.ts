/**
 * Structural-hash → composition cache with the "swap when ready" pattern.
 *
 * The cache is keyed by a STRUCTURAL HASH of the composition — the exact recompile-trigger
 * set (component/id/blend/mask/order/visible/opacity-bucket/transform/
 * bbox/requiresRTT/compileTime props/colorSpace/toneMapping), made explicit instead of
 * comparing node identity. `collectStructuralHashInputs` (composer.ts) produces the
 * inputs; `structuralHash` digests them here. Same inputs → same key → the built composition
 * (pipelines + bind groups + RTT textures + IR) is reused; any trigger change → a new key →
 * a fresh build.
 *
 * Swap-when-ready: when the composition changes the cache builds the new value but
 * keeps the previous one as the render target until the new one has drawn its first frame
 * successfully (`markReady`), so an in-progress recompile never flashes. LRU keeps ~4 built
 * compositions alive (users toggle back and forth while editing); eviction beyond that
 * disposes the evicted composition's exclusive resources (RTT textures). The current render
 * target and the in-flight pending build are never evicted.
 *
 * Generic over the built value `V` (the pass-manager composition bundle) so this module has
 * no GPU coupling and is unit-testable with a plain object + a spy disposer.
 */

/** FNV-1a 32-bit — a fast, stable, order-sensitive digest of the structural inputs. */
export function structuralHash(inputs: readonly string[]): string {
    let h = 0x811c9dc5
    const joined = inputs.join('')
    for (let i = 0; i < joined.length; i++) {
        h ^= joined.charCodeAt(i)
        // h *= 16777619, kept in 32-bit space.
        h = Math.imul(h, 0x01000193)
    }
    // Unsigned hex + length disambiguator (belt-and-braces against collisions).
    return `${(h >>> 0).toString(16).padStart(8, '0')}:${joined.length}`
}

interface CacheEntry<V> {
    hash: string
    value: V
    lastUsed: number
}

export interface PipelineCacheOptions<V> {
    /** LRU capacity. Default 4 (swap-during-editing without thrash). */
    maxSize?: number
    /** Called when an entry is evicted / released — destroy its exclusive RTT textures etc. */
    dispose?: (value: V, hash: string) => void
}

export interface PipelineCache<V> {
    /**
     * Return the built value for `hash`, building + caching it (via `buildFn`) on a miss.
     * A freshly-built value becomes the PENDING composition (not the render target) unless
     * there is no active composition yet (first build → active immediately). LRU-evicts the
     * least-recently-used entry when over capacity (never the active or pending one).
     */
    getOrBuild(hash: string, buildFn: () => V): V
    /**
     * Promote the pending composition to active once it has drawn its first successful frame.
     * The previous active stays in the LRU (reusable on a quick swap-back); it is disposed
     * only when evicted. No-op unless `hash` is the current pending build.
     */
    markReady(hash: string): void
    /** The composition to RENDER this frame — active until the pending build is confirmed. */
    readonly renderValue: V | null
    /** The active (rendered) composition's hash. */
    readonly activeHash: string | null
    /** The pending (built, not-yet-confirmed) composition's hash, or null. */
    readonly pendingHash: string | null
    /** Explicitly release a hash (dispose + drop). Clears active/pending if it was one. */
    release(hash: string): void
    has(hash: string): boolean
    /** Number of cached compositions. */
    readonly size: number
    /** Dispose every cached composition and reset. */
    clear(): void
}

export function createPipelineCache<V>(options: PipelineCacheOptions<V> = {}): PipelineCache<V> {
    const maxSize = options.maxSize ?? 4
    const dispose = options.dispose
    const entries = new Map<string, CacheEntry<V>>()
    let clock = 0
    let activeHash: string | null = null
    let pendingHash: string | null = null

    function touch(entry: CacheEntry<V>): void {
        entry.lastUsed = ++clock
    }

    function evictIfNeeded(): void {
        while (entries.size > maxSize) {
            // Find the least-recently-used entry that is neither active nor pending.
            let victim: CacheEntry<V> | null = null
            for (const e of entries.values()) {
                if (e.hash === activeHash || e.hash === pendingHash) continue
                if (!victim || e.lastUsed < victim.lastUsed) victim = e
            }
            if (!victim) break // everything left is active/pending — cannot evict
            entries.delete(victim.hash)
            dispose?.(victim.value, victim.hash)
        }
    }

    return {
        getOrBuild(hash, buildFn) {
            const existing = entries.get(hash)
            if (existing) {
                touch(existing)
                // Already the active target → no swap in flight.
                if (hash === activeHash) pendingHash = null
                // A cached-but-inactive composition requested → it becomes the pending swap.
                else pendingHash = hash
                return existing.value
            }
            const value = buildFn()
            const entry: CacheEntry<V> = {hash, value, lastUsed: ++clock}
            entries.set(hash, entry)
            if (activeHash === null) {
                // First composition — nothing to swap from, render it immediately.
                activeHash = hash
                pendingHash = null
            } else {
                pendingHash = hash
            }
            evictIfNeeded()
            return value
        },

        markReady(hash) {
            if (hash !== pendingHash) return
            const entry = entries.get(hash)
            if (!entry) return
            activeHash = hash
            pendingHash = null
            touch(entry)
            // The previous active stays in the LRU (reusable); disposal is deferred to eviction.
            evictIfNeeded()
        },

        get renderValue() {
            const hash = activeHash ?? pendingHash
            return hash ? (entries.get(hash)?.value ?? null) : null
        },
        get activeHash() {
            return activeHash
        },
        get pendingHash() {
            return pendingHash
        },

        release(hash) {
            const entry = entries.get(hash)
            if (!entry) return
            entries.delete(hash)
            dispose?.(entry.value, hash)
            if (activeHash === hash) activeHash = null
            if (pendingHash === hash) pendingHash = null
        },

        has(hash) {
            return entries.has(hash)
        },
        get size() {
            return entries.size
        },
        clear() {
            for (const e of entries.values()) dispose?.(e.value, e.hash)
            entries.clear()
            activeHash = null
            pendingHash = null
        },
    }
}
