import { type CSSProperties, type SVGProps } from 'react';

export type TracePathStyle = Omit<CSSProperties, 'strokeDasharray' | 'strokeDashoffset'>;

export type TracePathProps = Omit<
  SVGProps<SVGPathElement>,
  'd' | 'pathLength' | 'strokeDasharray' | 'strokeDashoffset' | 'style'
> & Readonly<{
  d: string;
  progress: number;
  style?: TracePathStyle;
}>;

export function TracePath({ d, progress, style, ...props }: TracePathProps) {
  if (!d.trim()) throw new Error('TracePath requires a non-empty SVG path.');
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new Error('TracePath progress must be finite and between zero and one.');
  }

  const hidden = progress === 0;
  const complete = progress === 1;
  const dash = complete ? 'none' : '1 1';
  const offset = complete ? 0 : 1 - progress;

  return (
    <path
      {...props}
      d={d}
      pathLength={1}
      strokeDasharray={dash}
      strokeDashoffset={offset}
      strokeOpacity={hidden ? 0 : props.strokeOpacity}
      style={{
        ...style,
        strokeDasharray: dash,
        strokeDashoffset: offset,
        strokeOpacity: hidden ? 0 : style?.strokeOpacity,
        visibility: hidden ? 'hidden' : style?.visibility,
      }}
    />
  );
}
