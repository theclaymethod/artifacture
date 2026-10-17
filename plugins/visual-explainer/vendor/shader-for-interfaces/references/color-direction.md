# Color direction

Color must come from the product, content, material, or data. Do not let a model's idea of "modern", "AI", "premium", or "technical" choose the palette.

Purple is not banned. Violet, indigo, blue, cyan, neon accents, dark themes, gradients, glow, and glass can all be correct when the source or visual contract calls for them. What is not acceptable is using the familiar purple-to-blue or purple-to-cyan gradient, neon-on-dark glow, and translucent glass cards as an unprompted default. Treat that cluster as an unresolved design decision.

## Source priority

Choose colors from the highest available source in this order:

1. Existing product tokens, brand guidelines, and established component states.
2. User-provided references, approved artwork, photography, textures, or a named visual direction.
3. Product-domain meaning, data semantics, and the physical material or lighting model being represented.
4. A written art direction that names the intended mood, contrast, temperature, and UI role.
5. A restrained neutral palette with one replaceable accent.

Do not skip an available higher-priority source because a generated palette looks more dramatic. If sources conflict, preserve required semantic and accessible colors first, then document which visual source won and why.

Before implementation, state the palette rationale in one or two sentences. Name the source of the neutrals, accent, semantic colors, and any emissive or atmospheric color. If no reason can be stated, the color is not ready to ship.

## Build a role-based palette

Define colors by role rather than scattering named colors or hex values through TypeScript and GLSL:

- `background`, `surface`, and `surfaceRaised`
- `text`, `textMuted`, `border`, and `focus`
- `accent` and, only when needed, `accentSecondary`
- `success`, `warning`, `danger`, and `info`
- shader-specific `fieldLow`, `fieldHigh`, `light`, `shadow`, `emissive`, and `atmosphere`
- data-specific sequential, diverging, categorical, missing, selected, and de-emphasized colors

Reuse host tokens when these roles already exist. Keep decorative shader colors separate from UI state colors so a glow cannot accidentally redefine focus, selection, warning, or error. Limit the number of dominant hues. Add another hue only when it creates a distinct role, not more visual activity.

Judge the palette in grayscale before increasing chroma. Background, surface, text, controls, and focal content should retain a clear hierarchy without relying on hue. Avoid pure black and pure white as automatic endpoints when softer neutrals better match the product, but do not reduce contrast merely to look subtle.

## Theme and system modes

- Treat the host product theme as the source of truth. Resolve semantic roles from design tokens or computed CSS values, convert authored sRGB colors through the renderer's color APIs, and update stable uniforms when the theme changes.
- Do not recreate materials, pipelines, geometry, or renderers merely to switch light and dark values. Rebuild only resources whose immutable format or layout actually changes.
- Test initial load in every supported theme and switch themes while the effect is idle, moving, loading, and behind real content. Fallback and reduced-motion states must update to the same role mapping.
- Keep the transition readable. Snap immediately when semantic contrast would be uncertain; otherwise bound any palette interpolation and inspect its brightest, darkest, and lowest-contrast intermediate frames.
- In forced-colors or high-contrast modes, preserve system-owned text, focus, control, and status colors in the DOM. Hide or simplify a decorative canvas when its compositing can no longer guarantee meaning or contrast.
- Treat `prefers-contrast` as an optional signal, not the only high-contrast path. Verify the actual accessibility mode and accessibility tree rather than inferring support from one media query.
- Never bake theme identity into a data value, selection state, or error channel. Theme changes may alter presentation roles without changing represented meaning.

## Gradients, glow, and glass

Use a gradient to describe light, depth, material, spatial transition, or ordered data. Do not add one only to make a surface look technological. Define its endpoints, direction or center, interpolation behavior, and UI role. Avoid rainbow ramps and unrelated hue stops.

Use glow as emitted light or controlled emphasis. It must have a visible source, remain subordinate to content, and not act as the only affordance. Keep bloom-like color away from body text, focus rings, chart labels, and fine edges.

Use glass only when transparency communicates layering or spatial context. Test the real content behind it at its brightest, darkest, and busiest states. Backdrop blur is not a substitute for an opaque readable surface.

Do not stack gradient text, a purple or cyan aurora, glowing borders, translucent cards, and a permanent dark background unless the visual contract explicitly requires that language. Prefer one dominant atmospheric device and let the remaining layers support it. Expose bounded controls for intensity, opacity, glow radius, and chroma rather than embedding extreme constants.

## UI contrast and meaning

- Target at least 4.5:1 contrast for normal text and 3:1 for large text against every background state it can cross.
- Give controls, focus indicators, selected states, and meaningful non-text graphics at least 3:1 contrast against adjacent colors where WCAG requires it.
- Never encode status, selection, direction, or error with hue alone. Pair color with text, shape, icon, pattern, position, or another stable cue.
- Check muted text and disabled states separately. Disabled can be quieter without becoming unreadable or indistinguishable.
- Test transparent UI over the live shader, not over a convenient solid mock background.
- Keep essential text and controls in the DOM. The shader must not be the only carrier of meaning.

If motion can pass behind text, reserve a protected luminance range or add a stable local surface. A contrast ratio that passes in one captured frame is insufficient.

## Animated color checks

Freeze time or use a fixed seed to approve the still composition, then inspect the full animation cycle or a representative interval. Check at minimum the initial frame, midpoint, brightest frame, darkest frame, and any loop boundary.

Watch for:

- transient contrast failures behind text and controls
- rapid full-surface luminance changes, flicker, or alternating saturated hues
- muddy intermediate colors caused by interpolation or blending
- clipped highlights, crushed shadows, and hue shifts from tone mapping
- alpha edges that turn dark, bright, or colored over the real page background
- gradient banding, quantization, seams, and visible time-wrap discontinuities
- glow or chroma that expands under pointer, scroll, audio, or data extremes

Test the reduced-motion state and fallback with the same palette roles. They should feel like the same product, not a generic replacement gradient.

## Data palettes

Color used for data is representational, even when the rendering is expressive.

- Use a sequential scale for ordered magnitude, a diverging scale only around a meaningful midpoint, a cyclical scale only for a genuinely periodic domain, and categorical colors only for distinct groups.
- Give a sequential scale monotonic perceived lightness across its domain. For a diverging scale, make each arm perceptually ordered away from the midpoint and keep that midpoint distinct. A cyclical scale must return continuously to its starting appearance, so do not impose a false global low-to-high lightness order on it.
- Keep missing, invalid, selected, and de-emphasized values visibly distinct from valid data and from each other.
- Test common color-vision deficiencies and the grayscale view. Provide labels, legends, tooltips, or patterns so hue is not the only decoder.
- Keep decorative atmosphere and lighting from changing the apparent class or magnitude. If lighting is aesthetic, separate it from the data color channel.
- Freeze decorative motion while users inspect exact values, and retain the DOM legend and accessible alternative described in [data-visualization.md](data-visualization.md).

## Three.js and GLSL color handling

Treat palette selection and color-space correctness as separate requirements. A well-chosen palette can still render incorrectly.

- Do lighting, mixing, and compositing in Linear-sRGB unless a documented effect requires another working space.
- Mark color textures as `SRGBColorSpace`. Leave data, normal, roughness, masks, lookup values, and other non-color textures at `NoColorSpace`.
- Convert authored sRGB color values to the material's expected working space through Three.js APIs. Do not guess gamma-adjusted constants in GLSL.
- A default `ShaderMaterial` that writes to the display should finish with Three.js tone-mapping and color-space chunks when those renderer features apply:

```glsl
#include <tonemapping_fragment>
#include <colorspace_fragment>
```

These chunks write `gl_FragColor`. With explicit `glslVersion: THREE.GLSL3`, follow the custom-output alias contract in [glsl-patterns.md](glsl-patterns.md) instead of declaring an unrelated output and then including the chunks unchanged. A `RawShaderMaterial` must own the required declarations and output transforms.

- In a composer chain, normally place `OutputPass` after working-space passes and near the screen boundary. It applies the renderer-selected tone mapping and output color-space conversion. Put only passes that explicitly require sRGB input, such as FXAA, after it, and do not repeat the same tone mapping or output transfer elsewhere.
- Keep data values linear and untouched by display color conversion until they are mapped to a display color.
- Verify renderer output color space, tone mapping, exposure, alpha, blending, and premultiplication over the actual interface background.
- Diagnose unexpected darkness, washed color, or shifted gradients as a color-space problem before retuning the palette. See [glsl-patterns.md](glsl-patterns.md) for the shared output rules.

## Acceptance checklist

Before accepting the color direction, confirm:

- [ ] Every dominant hue and effect has a product, reference, material, or data rationale.
- [ ] The result does not fall back to a generic purple-cyan, neon-on-dark, glow-and-glass package without an explicit requirement.
- [ ] Purple or another familiar color is retained when justified, rather than removed only to evade a style label.
- [ ] Palette values are role-based and reuse existing tokens where available.
- [ ] Light, dark, runtime theme changes, fallback, reduced motion, and supported forced-colors/high-contrast modes preserve the same semantic role mapping.
- [ ] UI, semantic, decorative, and data colors do not compete for the same role.
- [ ] Text, controls, focus, selection, and non-text UI pass contrast checks over every relevant frame and background.
- [ ] Meaning remains understandable without hue alone and under color-vision simulation.
- [ ] Gradients, glow, transparency, and blending survive grayscale, reduced motion, fallback, mobile, and unusual aspect-ratio checks.
- [ ] Initial, midpoint, extreme, and loop-boundary frames have been inspected for flashes, mud, clipping, banding, seams, and alpha artifacts.
- [ ] Sequential, diverging, cyclical, categorical, missing, and selected data colors preserve their declared semantics.
- [ ] Color textures, data textures, output conversion, tone mapping, and post-processing follow the Three.js color-space contract.
- [ ] The final palette still feels specific after the product name and marketing copy are hidden.

## References

- [Impeccable: Slop pattern catalog](https://impeccable.style/slop/)
- [WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [WCAG 2.2: Contrast Minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [USWDS: Using color](https://designsystem.digital.gov/design-tokens/color/overview/)
- [D3 scale-chromatic](https://d3js.org/d3-scale-chromatic)
- [Three.js: Color management](https://threejs.org/manual/en/color-management.html)
