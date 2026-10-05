/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- Decode external manifest JSON here before it reaches React or a composition. */
export type NativeClipAsset = Readonly<{
  id: string; title: string; engine: 'manim' | 'psychopomp';
  theme: 'hairline' | '3b1b' | 'mono-color' | 'algebrica';
  video: string; poster: string; width: number; height: number; fps: number; duration: number; frames: number; hasAudio: boolean;
  stills: readonly Readonly<{ seconds: number; sampledSeconds: number; frameIndex: number; image: string }>[];
}>;

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Native assets require meaningful text.');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Native assets require nonnegative integer frame and dimension values.');
  return value;
}
function seconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Native timing must be finite and nonnegative.');
  return value;
}
function fileName(value: unknown): string {
  const file = text(value);
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(file) || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Native asset files must be confined relative paths.');
  return file;
}

export function validateNativeClipAsset(input: unknown): NativeClipAsset {
  if (!input || typeof input !== 'object' || !('id' in input) || !('title' in input) || !('engine' in input) || !('theme' in input) || !('video' in input) || !('poster' in input) || !('width' in input) || !('height' in input) || !('fps' in input) || !('duration' in input) || !('frames' in input) || !('hasAudio' in input) || !('stills' in input)) throw new Error('Expected a complete native manifest asset.');
  const id = text(input.id), title = text(input.title), engine = input.engine, theme = input.theme;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || (engine !== 'manim' && engine !== 'psychopomp') || (theme !== 'hairline' && theme !== '3b1b' && theme !== 'mono-color' && theme !== 'algebrica')) throw new Error('Native assets need a slug ID, supported engine and theme.');
  const width = integer(input.width), height = integer(input.height), fps = integer(input.fps), frames = integer(input.frames), duration = seconds(input.duration);
  const hasAudio = input.hasAudio;
  if (hasAudio !== true && hasAudio !== false) throw new Error('Native assets must declare whether the encoded clip contains audio.');
  if (width < 64 || width > 3840 || height < 64 || height > 3840 || width % 2 || height % 2 || !fps || fps > 60 || !frames || !duration || Math.abs(duration - frames / fps) > 1 / fps) throw new Error('Native dimensions and encoded frame timing disagree.');
  if (!Array.isArray(input.stills) || !input.stills.length || input.stills.length > 24) throw new Error('Native assets need 1–24 selected stills.');
  const stills = input.stills.map((still: unknown) => {
    if (!still || typeof still !== 'object' || !('seconds' in still) || !('sampledSeconds' in still) || !('frameIndex' in still) || !('image' in still)) throw new Error('Expected a selected native frame.');
    const requested = seconds(still.seconds), sampledSeconds = seconds(still.sampledSeconds), frameIndex = integer(still.frameIndex);
    if (frameIndex >= frames || Math.round(requested * fps) !== frameIndex || Math.abs(sampledSeconds - frameIndex / fps) > 1e-8) throw new Error('Native stills must identify their nearest encoded frame inside the clip.');
    return Object.freeze({ seconds: requested, sampledSeconds, frameIndex, image: fileName(still.image) });
  });
  if (new Set(stills.map(still => still.seconds)).size !== stills.length) throw new Error('Native selected still times must be distinct.');
  return Object.freeze({ id, title, engine, theme, width, height, fps, frames, duration, hasAudio, video: fileName(input.video), poster: fileName(input.poster), stills: Object.freeze(stills) });
}
