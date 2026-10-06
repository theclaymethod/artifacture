import { useEffect, useRef, useState } from 'react';
import { mountTrophyScene } from './native-trophy-scene';
import type { TrophyKind } from './native-trophy-models';

export interface NativeProceduralPropProps {
  kind: TrophyKind;
  reveal?: boolean;
  seconds?: number;
  label: string;
}

/** The original model, materials, camera, shadows and finite reveal. */
export function NativeProceduralProp({ kind, reveal = true, label, seconds }: NativeProceduralPropProps) {
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0)) throw new Error('NativeProceduralProp seconds must be finite and nonnegative.');
  const sampled = useRef(seconds);
  sampled.current = seconds;
  const managed = seconds !== undefined;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    setUnavailable(false);
    return mountTrophyScene(canvas.current, { kind, reveal, seconds: managed ? () => sampled.current : undefined, onUnavailable: () => setUnavailable(true) });
  }, [kind, reveal, managed]);
  return <>
    <canvas ref={canvas} aria-label={label} style={{ display: 'block', width: '100%', height: '100%' }} />
    {unavailable && <p role="status">This figure requires WebGL.</p>}
  </>;
}
