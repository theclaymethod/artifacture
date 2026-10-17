# Textures and distortion

## Load with an explicit contract

- Record the image source, intrinsic dimensions, intended crop, color role, alpha mode, and fallback before sampling it.
- Mark ordinary color images with `texture.colorSpace = THREE.SRGBColorSpace`. Keep displacement maps, masks, normals, IDs, and other data textures at `THREE.NoColorSpace`.
- Do not reveal the shader surface until required textures have loaded. Handle network, decode, CORS, and unsupported-format failures with a visible fallback.
- Keep the source image or equivalent alt text in the DOM when it conveys content. A distorted canvas is not an accessible image replacement.

## Contain and cover

Choose the crop rule deliberately. For a cover crop in normalized UV space:

```glsl
vec2 coverUv(vec2 uv, vec2 viewportSize, vec2 imageSize) {
  float viewportAspect = viewportSize.x / max(viewportSize.y, 1.0);
  float imageAspect = imageSize.x / max(imageSize.y, 1.0);
  vec2 scale = viewportAspect < imageAspect
    ? vec2(viewportAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / viewportAspect);
  return (uv - 0.5) * scale + 0.5;
}
```

Inspect all four edges after resize. Decide whether displaced samples clamp, repeat, mirror, fade, or reveal a second texture. Accidental edge smearing is not a transition strategy.

## Distortion rules

- Start with an identity sample, then expose one bounded displacement amount and one scale.
- Keep displacement in a named coordinate space. Convert pointer and aspect ratio before combining them with UV offsets.
- For image transitions, define exact start and end frames. The output at progress `0` and `1` should match the source images without residual warping.
- Avoid allocating canvases, image bitmaps, or textures in the frame loop. Dispose only textures the component owns; shared loader caches need their own lifetime policy.

## Checks

Test slow loading, a failed URL, portrait and landscape images, unusual surface ratios, retina DPR, transparent pixels, reduced motion, and repeated mount and unmount. Compare the canvas crop with the intended DOM `object-fit` behavior.
