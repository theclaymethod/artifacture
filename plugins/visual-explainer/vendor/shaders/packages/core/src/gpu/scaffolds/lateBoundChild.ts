/**
 * Late-bound child input for a compute hook.
 *
 * A compute pass that reads its child layer reads a COMPOSITION BOUNDARY: the child subtree is
 * rasterised to an RTT texture, and that physical texture is allocated by the pass manager AFTER
 * composition runs. So the shader's `compute` hook can name the input (`convertToTexture(childNode)`
 * hands back a `KitTexture` with a stable key) but cannot build a bind group over it yet. The
 * contract's `bindInputs` callback closes the gap: the pass manager calls it once the RTT exists,
 * and again on every recompose.
 *
 * Five shaders wrote the same three-part block by hand (ParticleField, ReactionDiffusion, TimeTrail,
 * DataMosh, KeyFrames): resolve the key, bail if the resolver has nothing yet, build the bind
 * groups with an `as never` cast, and make `getComputeNodes` return `null` until they exist. This
 * collapses that to one call.
 *
 * The `as never` cast is deliberately kept HERE, in one audited place, rather than at five call
 * sites. It exists because `root.createBindGroup` wants typegpu's resource types while the
 * contract's resolver is typed `{texture: unknown}` (the renderer holds the texture opaquely).
 * Fixing that properly is a contract-level change (`bindInputs` typing, Phase 12); until then the
 * cast has exactly one home.
 */
import type {GpuFragmentParams, KitTexture} from '../contract'

/** The resolver the pass manager passes to `bindInputs`: texture key → bound texture. */
type InputResolver = (key: string) => {texture: unknown} | undefined

export interface LateBoundChildInput<TGroups> {
    /**
     * The child's RTT handle. Put it in the compute node's `outputs` so the fragment can sample
     * the same texture (`computeOutputs.childTexture`) instead of RTT-ing the child twice.
     */
    readonly childTexture: KitTexture
    /** Hand straight to the compute node's `bindInputs`. */
    bindInputs: (resolve: InputResolver) => void
    /**
     * The bind groups built by `buildGroups`, or `null` while the child RTT is still unallocated.
     * The canonical first line of `getComputeNodes` is `const g = child.bound(); if (!g) return null`.
     */
    bound(): TGroups | null
    /** Boolean form of {@link bound}, for readability in tests and guards. */
    ready(): boolean
}

/**
 * Name a compute hook's child input and defer its bind-group construction to `bindInputs`.
 *
 * `buildGroups` receives the resolved child texture — already cast to the type
 * `root.createBindGroup` accepts — and returns whatever collection of bind groups the shader
 * needs (a single group, a `{a, b}` orientation pair, an object of several). It re-runs on every
 * recompose, so anything it allocates must be safe to rebuild.
 *
 * Returns `null` when the node has no child at all, so a child-REQUIRED shader can write
 * `if (!child) return null` and inherit the "no child → no compute" branch.
 *
 * @example
 * const child = createLateBoundChildInput(params, (src) => ({
 *     bg: root.createBindGroup(layout, {src, prev: stateA, next: stateB, params: buf.buffer}),
 * }))
 * if (!child) return null
 * return {
 *     outputs: {childTexture: child.childTexture, display},
 *     bindInputs: child.bindInputs,
 *     getComputeNodes: () => {
 *         const g = child.bound()
 *         if (!g) return null
 *         return [pipeline.with(g.bg)]
 *     },
 * }
 */
export function createLateBoundChildInput<TGroups>(
    params: GpuFragmentParams,
    buildGroups: (childTexture: never) => TGroups,
): LateBoundChildInput<TGroups> | null {
    const {childNode, convertToTexture} = params
    if (!childNode || !convertToTexture) return null
    const childTexture = convertToTexture(childNode)

    let groups: TGroups | null = null
    return {
        childTexture,
        bindInputs: (resolve: InputResolver) => {
            const src = resolve(childTexture.key)
            if (!src) return
            // The one `as never` — see the module header.
            groups = buildGroups(src.texture as never)
        },
        bound: () => groups,
        ready: () => groups !== null,
    }
}
