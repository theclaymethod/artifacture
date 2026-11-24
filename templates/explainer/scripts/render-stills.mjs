import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSceneStill } from '@artifacture/gpu/node';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { resolveShader } from '@vgpu/wgsl/runtime';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wgslPath = path.join(ROOT, 'src/shaders/wave-field.wgsl');
const resolved = await resolveShader({
  entry: wgslPath,
  rootDir: path.dirname(wgslPath),
  validate: 'require',
});
const shader = prepareShader(resolved.wgsl, wgslPath);

const metrics = await renderSceneStill({
  scene: {
    id: 'wave-field',
    label: 'Harmonic contour wave field',
    shader,
    stillTime: 1.2,
    stillSize: [1280, 720],
    defaultParams: {
      frequency: 6.5,
      amplitude: 0.18,
      baseColor: [0.965, 0.972, 0.984],
      accentColor: [0.027, 0.624, 0.729],
    },
  },
  outPath: path.join(ROOT, 'src/assets/wave-field-still.png'),
});

console.log(JSON.stringify(metrics, null, 2));
