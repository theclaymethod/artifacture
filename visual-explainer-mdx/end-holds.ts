import type { GraphicMotion } from './graphic-motion';

export type HoldCue = Readonly<{ id: string; at: number }>;
export type EndHoldViolation = Readonly<{ kind: 'track' | 'cue'; target: string; property?: string; endsAt: number; hold: number }>;
export type EndHoldOptions = Readonly<{
  /** Seconds a slot must show its finished state before the cut. */
  minHold?: number;
  /** Seconds a delivery-layer cue (kinetic type, caption, still) needs on screen before the cut. */
  minCueHold?: number;
  /** Cues timed by the delivery layer rather than the scene motion. */
  cues?: readonly HoldCue[];
  /** Slot length when the slide or beat is longer than its motion. */
  slot?: number;
}>;

/**
 * Report every track that is still changing, and every cue that appears, too close to the end of
 * its slot. An empty result means the slot reaches its end state in time for the viewer to read it.
 */
export function inspectEndHolds(motion: GraphicMotion, options: EndHoldOptions = {}): readonly EndHoldViolation[] {
  const { minHold = .75, minCueHold = 1.1, cues = [], slot = motion.duration } = options;
  if (!(minHold >= 0) || !(minCueHold >= 0) || !(slot > 0) || slot < motion.duration) throw new Error('End holds need nonnegative holds and a slot at least as long as its motion.');
  const late: EndHoldViolation[] = [];
  for (const track of motion.tracks) {
    const endsAt = track.start + track.duration, hold = slot - endsAt;
    if (hold < minHold) late.push({ kind: 'track', target: track.target, property: track.property, endsAt, hold });
  }
  for (const cue of cues) {
    if (!cue.id?.trim() || !Number.isFinite(cue.at)) throw new Error('Hold cues need an ID and a finite time.');
    const hold = slot - cue.at;
    if (hold < minCueHold) late.push({ kind: 'cue', target: cue.id, endsAt: cue.at, hold });
  }
  return Object.freeze(late.sort((a, b) => a.hold - b.hold).map(violation => Object.freeze(violation)));
}
