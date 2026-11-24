struct RenderParams {
  resolution: vec2f,
  _pad0: vec2f,
}

struct ProjectedSplat {
  centerRad: vec4f,
  axisDepth: vec4f,
  colorAlpha: vec4f,
}

@group(0) @binding(0) var<uniform> params: RenderParams;
@group(0) @binding(1) var<storage, read> projected: array<ProjectedSplat>;
@group(0) @binding(2) var<storage, read> sortedIndices: array<u32>;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) localCoord: vec2f,
  @location(1) colorAlpha: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VertexOut {
  var out: VertexOut;
  let idx = sortedIndices[iid];
  let p = projected[idx];

  if (p.axisDepth.w < 0.5) {
    out.position = vec4f(2.0, 2.0, 2.0, 1.0);
    out.localCoord = vec2f(0.0);
    out.colorAlpha = vec4f(0.0);
    return out;
  }

  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f(1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0),
    vec2f(1.0, 1.0),
    vec2f(-1.0, 1.0),
  );
  let corner = corners[vid % 6u];

  let res = max(params.resolution, vec2f(1.0));
  let eig1 = p.axisDepth.xy;
  let eig2 = vec2f(-eig1.y, eig1.x);
  let pxOffset = corner.x * eig1 * p.centerRad.z + corner.y * eig2 * p.centerRad.w;
  let ndc = p.centerRad.xy + pxOffset / (0.5 * res);

  out.position = vec4f(ndc, 0.0, 1.0);
  out.localCoord = corner * 3.0;
  out.colorAlpha = p.colorAlpha;
  return out;
}

@fragment
fn fs_main(@location(0) localCoord: vec2f, @location(1) colorAlpha: vec4f) -> @location(0) vec4f {
  let r2 = dot(localCoord, localCoord);
  if (r2 > 9.0) {
    discard;
  }
  let alpha = min(0.99, colorAlpha.a * exp(-0.5 * r2));
  if (alpha < 0.008) {
    discard;
  }
  return vec4f(colorAlpha.rgb * alpha, alpha);
}
