import {
  applyExposure,
  linearToSrgb3,
  srgbToLinear3,
  tonemapAces,
} from '@vgpu/wgsl-std/color';
import { hash2 } from '@vgpu/wgsl-std/hash';
import { fbmSimplex3d } from '@vgpu/wgsl-std/noise/simplex';

struct Params {
  time: f32,
  morph: f32,
  yaw: f32,
  pitch: f32,
  zoom: f32,
  offsetX: f32,
  dispersion: f32,
  refraction: f32,
  bgColor: vec3f,
  _pad0: f32,
  accentColor: vec3f,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn rot2(a: f32) -> mat2x2<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat2x2<f32>(vec2f(c, -s), vec2f(s, c));
}

fn sdRoundBox(p: vec3f, b: vec3f, r: f32) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

fn sdTorus(p: vec3f, t: vec2f) -> f32 {
  let q = vec2f(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn mapScene(pos: vec3f) -> f32 {
  var p = pos;
  let ry = rot2(params.yaw + params.time * 0.16);
  let rx = rot2(params.pitch);
  let p_xz = ry * p.xz;
  p = vec3f(p_xz.x, p.y, p_xz.y);
  let p_yz = rx * p.yz;
  p = vec3f(p.x, p_yz.x, p_yz.y);

  let m = clamp(params.morph, 0.0, 1.0);
  let ripple = fbmSimplex3d(p * 1.15 + vec3f(0.0, params.time * 0.18, 0.0), 2, 2.0, 0.45) * 0.032;

  let prism = sdRoundBox(p, vec3f(0.54, 0.72, 0.34), 0.14);
  let torus = sdTorus(p.xzy, vec2f(0.68, 0.23));
  let satPos = vec3f(
    0.78 * sin(m * 3.14159 + params.time * 0.22 + 0.7),
    0.26 * cos(m * 2.2 + 0.5),
    0.22,
  );
  let satellite = length(p - satPos) - 0.25;

  let core = mix(prism, torus, m);
  return smin(core, satellite, 0.30) + ripple * mix(0.4, 1.0, m);
}

fn calcNormal(p: vec3f) -> vec3f {
  let e = vec2f(0.003, -0.003);
  return normalize(
    e.xyy * mapScene(p + e.xyy) +
    e.yyx * mapScene(p + e.yyx) +
    e.yxy * mapScene(p + e.yxy) +
    e.xxx * mapScene(p + e.xxx)
  );
}

fn sampleEnvironment(dir: vec3f, accent: vec3f) -> vec3f {
  let y = dir.y * 0.5 + 0.5;
  let darkSlate = vec3f(0.035, 0.055, 0.075);
  let midSlate = vec3f(0.14, 0.21, 0.27);
  let studioBand = smoothstep(0.06, 0.0, abs(dir.y - 0.22 * sin(dir.x * 2.2 + params.time * 0.18)));
  let horizonStripe = smoothstep(0.04, 0.0, abs(dir.y + 0.14));
  let keyLight = pow(max(dot(dir, normalize(vec3f(0.62, 0.72, 0.44))), 0.0), 24.0);
  let fillLight = pow(max(dot(dir, normalize(vec3f(-0.72, -0.25, 0.55))), 0.0), 8.0);
  let rimLight = pow(max(dot(dir, normalize(vec3f(-0.65, 0.55, -0.52))), 0.0), 16.0);

  var env = mix(darkSlate, midSlate, smoothstep(0.1, 0.9, y));
  env += accent * (1.75 * keyLight + 0.75 * studioBand + 0.45 * fillLight);
  env += vec3f(0.95, 0.97, 1.0) * (2.4 * keyLight + 1.05 * rimLight + 0.75 * horizonStripe);
  return env;
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = vec2f((uv.x - 0.5) * 1.7777778 - params.offsetX, 0.5 - uv.y);
  let ro = vec3f(0.0, 0.0, 4.35 / max(params.zoom, 0.35));
  let rd = normalize(vec3f(p, -1.75));

  let bg = srgbToLinear3(params.bgColor);
  let accent = srgbToLinear3(params.accentColor);

  let radial = exp(-dot(p, p) * 1.05);
  var color = mix(bg * 0.90, bg * 1.02 + accent * 0.04, radial);

  let floorShade = exp(-pow((p.x - 0.02) * 1.45, 2.0) - pow((p.y + 0.52) * 8.5, 2.0));
  color *= 1.0 - floorShade * 0.14;

  var t = 0.0;
  var hit = false;
  for (var i = 0; i < 84; i++) {
    let d = mapScene(ro + rd * t);
    if (d < 0.0014) {
      hit = true;
      break;
    }
    t += d * 0.9;
    if (t > 9.5) {
      break;
    }
  }

  if (hit) {
    let pos = ro + rd * t;
    let n = calcNormal(pos);
    let viewDir = -rd;
    let ndotv = clamp(dot(n, viewDir), 0.0, 1.0);
    let fresnel = pow(1.0 - ndotv, 3.0);

    let reflDir = reflect(rd, n);
    let refl = sampleEnvironment(reflDir, accent);

    let disp = params.dispersion * 0.07;
    let etaBase = 1.0 / max(params.refraction, 1.05);
    let refrR = sampleEnvironment(refract(rd, n, etaBase - disp), accent);
    let refrG = sampleEnvironment(refract(rd, n, etaBase), accent);
    let refrB = sampleEnvironment(refract(rd, n, etaBase + disp), accent);
    let refracted = vec3f(refrR.r, refrG.g, refrB.b);

    let absorption = mix(vec3f(0.20, 0.31, 0.38), accent * 1.2 + vec3f(0.06), 0.72);
    let interior = refracted * absorption + accent * (0.24 * pow(1.0 - ndotv, 1.4));
    let spec = pow(max(dot(reflDir, normalize(vec3f(0.55, 0.8, 0.5))), 0.0), 64.0) * 1.7;
    let rimEdge = pow(1.0 - ndotv, 4.2) * 0.55;

    color = mix(interior, refl, clamp(0.18 + fresnel * 0.82, 0.0, 1.0)) + vec3f(spec) + accent * rimEdge;
  }

  let grain = (hash2(uv * 960.0 + vec2f(params.time * 13.0, 7.0)).x - 0.5) * 0.008;
  let finalColor = linearToSrgb3(tonemapAces(applyExposure(color, 1.04))) + vec3f(grain);
  return vec4f(clamp(finalColor, vec3f(0.0), vec3f(1.0)), 1.0);
}
