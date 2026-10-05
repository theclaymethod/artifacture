export type VideoFramePlan = Readonly<{
  duration: number;
  fps: number;
  rounding: 'ceil' | 'floor' | 'nearest';
  frameCount: number;
  encodedDuration: number;
  lastFrameTime: number;
  endpointTime: number;
  timeAtFrame: (index: number) => number;
}>;

export function createVideoFramePlan(input: Readonly<{ duration: number; fps: number; rounding: VideoFramePlan['rounding'] }>): VideoFramePlan {
  if (!Number.isFinite(input.duration) || input.duration <= 0 || !Number.isFinite(input.fps) || input.fps <= 0 || !['ceil', 'floor', 'nearest'].includes(input.rounding)) throw new Error('Frame plans need positive finite duration/FPS and an explicit rounding policy.');
  const round = input.rounding === 'nearest' ? Math.round : Math[input.rounding];
  const frameCount = round(input.duration * input.fps);
  const encodedDuration = frameCount / input.fps, lastFrameTime = (frameCount - 1) / input.fps;
  if (!Number.isSafeInteger(frameCount) || frameCount < 1 || !Number.isFinite(encodedDuration) || !Number.isFinite(lastFrameTime)) throw new Error('Frame plans need a safe positive frame count and finite sample times.');
  const fps = input.fps;
  return Object.freeze({
    ...input, frameCount, encodedDuration, lastFrameTime, endpointTime: input.duration,
    timeAtFrame(index: number) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= frameCount) throw new Error('Frame index is outside the encoded range.');
      return index / fps;
    },
  });
}

export type LoopFrameInspection = Readonly<{
  endpointClosed: boolean;
  lastEncodedMatchesStart: boolean;
  lastFrameTime: number;
  endpointTime: number;
}>;

// Return detached snapshots from sample; a reused mutable renderer buffer is not a snapshot.
// This compares sampled state. Velocity continuity, audio and pixel quality need their own checks.
export async function inspectLoopFrames<T>(input: Readonly<{ plan: VideoFramePlan; sample: (seconds: number) => T | Promise<T>; equal: (a: T, b: T) => boolean }>): Promise<LoopFrameInspection> {
  const start = await input.sample(0);
  const last = await input.sample(input.plan.lastFrameTime);
  const endpoint = await input.sample(input.plan.endpointTime);
  const endpointClosed = input.equal(start, endpoint), lastEncodedMatchesStart = input.equal(start, last);
  if ((endpointClosed !== true && endpointClosed !== false) || (lastEncodedMatchesStart !== true && lastEncodedMatchesStart !== false)) throw new Error('Loop equality must return a boolean.');
  return Object.freeze({ endpointClosed, lastEncodedMatchesStart, lastFrameTime: input.plan.lastFrameTime, endpointTime: input.plan.endpointTime });
}
