import { useId, type CSSProperties } from 'react';

export interface OrbitalTextPalette {
  background: string;
  ink: string;
  accent: string;
}

export interface OrbitalTextProps {
  phrases: readonly string[];
  seconds: number;
  palette: Readonly<OrbitalTextPalette>;
  label: string;
  width?: number;
  height?: number;
  rings?: number;
  activeRing?: number;
  guides?: boolean;
  className?: string;
  style?: CSSProperties;
}

const coveragePattern = [0.44, 0.7, 0.55, 0.82, 0.48, 0.74, 0.62, 0.88] as const;
const opacityPattern = [0.34, 0.5, 0.4, 0.62, 0.38, 0.56] as const;
const trackingPattern = [0.58, 0.66, 0.61, 0.71, 0.63] as const;

function circlePath(centerX: number, centerY: number, radius: number) {
  const right = centerX + radius;
  const left = centerX - radius;
  return `M ${right} ${centerY} A ${radius} ${radius} 0 1 1 ${left} ${centerY} A ${radius} ${radius} 0 1 1 ${right} ${centerY}`;
}

function normalizedPhrase(phrase: string) {
  const text = phrase.trim().replace(/\s+/g, ' ');
  return /[·•]$/.test(text) ? `${text} ` : `${text} · `;
}

function ringText(phrase: string, circumference: number, fontSize: number, coverage: number, tracking: number) {
  const unit = normalizedPhrase(phrase);
  const targetCharacters = Math.ceil(circumference * coverage / (fontSize * tracking));
  return unit.repeat(Math.max(1, Math.ceil(targetCharacters / unit.length)));
}

function phrasePhase(phrase: string, ring: number) {
  let hash = 2166136261;
  for (const character of phrase) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 360 + ring * 37.7) % 360;
}

function validateProps({ phrases, seconds, palette, label, width, height, rings, activeRing }: Required<Pick<OrbitalTextProps, 'phrases' | 'seconds' | 'palette' | 'label' | 'width' | 'height' | 'rings' | 'activeRing'>>) {
  if (!phrases.length || phrases.length > 32 || phrases.some((phrase) => !phrase.trim() || phrase.length > 240)) {
    throw new Error('OrbitalText requires 1–32 non-empty phrases of at most 240 characters.');
  }
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('OrbitalText seconds must be finite and nonnegative.');
  if (!label.trim()) throw new Error('OrbitalText requires an accessible label.');
  if (![palette.background, palette.ink, palette.accent].every((color) => color.trim())) {
    throw new Error('OrbitalText palette colors must be non-empty.');
  }
  if (![width, height].every((size) => Number.isInteger(size) && size >= 64 && size <= 4096)) {
    throw new Error('OrbitalText width and height must be integers from 64 to 4096.');
  }
  if (!Number.isInteger(rings) || rings < 3 || rings > 32) throw new Error('OrbitalText rings must be an integer from 3 to 32.');
  if (!Number.isInteger(activeRing) || activeRing < 0 || activeRing >= rings) {
    throw new Error('OrbitalText activeRing must identify one of its rings.');
  }
}

export function OrbitalText({
  phrases,
  seconds,
  palette,
  label,
  width = 960,
  height = 540,
  rings = 18,
  activeRing = Math.floor(rings * 0.58),
  guides = true,
  className,
  style,
}: OrbitalTextProps) {
  validateProps({ phrases, seconds, palette, label, width, height, rings, activeRing });
  const reactId = useId().replace(/:/g, '');
  const titleId = `ve-orbital-title-${reactId}`;
  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.min(width, height) * 0.455;
  const innerRadius = Math.max(28, outerRadius * 0.15);
  const spacing = (outerRadius - innerRadius) / (rings - 1);

  const ringData = Array.from({ length: rings }, (_, ring) => {
    const radius = innerRadius + spacing * ring;
    const phrase = phrases[(ring * 7 + 2) % phrases.length];
    const active = ring === activeRing;
    const coverage = active ? 0.92 : coveragePattern[ring % coveragePattern.length];
    const fontSize = Math.max(8, Math.min(14, spacing * (active ? 0.86 : 0.72)));
    const circumference = Math.PI * 2 * radius;
    const tracking = trackingPattern[ring % trackingPattern.length];
    const direction = ring % 2 === 0 ? -1 : 1;
    const rate = (1.8 + (ring * 0.381 % 1) * 1.2) / Math.sqrt(Math.max(radius / outerRadius, 0.15));
    const angle = phrasePhase(phrase, ring) + seconds * rate * direction;
    return {
      active,
      angle: ((angle % 360) + 360) % 360,
      circumference,
      coverage,
      fontSize,
      id: `ve-orbital-path-${reactId}-${ring}`,
      opacity: active ? 0.94 : opacityPattern[ring % opacityPattern.length],
      path: circlePath(centerX, centerY, radius),
      radius,
      text: ringText(phrase, circumference, fontSize, coverage, tracking),
    };
  });

  return (
    <svg
      aria-labelledby={titleId}
      className={className}
      data-orbital-text
      focusable="false"
      height={height}
      role="img"
      style={{ display: 'block', height: 'auto', maxWidth: '100%', width: '100%', ...style }}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={titleId}>{label}</title>
      <rect fill={palette.background} height={height} width={width} />
      <defs>
        {ringData.map((ring) => <path key={ring.id} d={ring.path} id={ring.id} />)}
      </defs>
      {guides ? (
        <g aria-hidden="true" fill="none" stroke={palette.ink} strokeOpacity="0.13" strokeWidth="0.75" vectorEffect="non-scaling-stroke">
          {ringData.map((ring) => <circle key={ring.id} cx={centerX} cy={centerY} r={ring.radius} />)}
        </g>
      ) : null}
      <g fontFamily="var(--ve-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace)" fontWeight="500">
        {ringData.map((ring) => (
          <text
            aria-hidden="true"
            fill={ring.active ? palette.accent : palette.ink}
            fontSize={ring.fontSize}
            key={ring.id}
            lengthAdjust="spacing"
            opacity={ring.opacity}
            textLength={ring.circumference * ring.coverage}
            transform={`rotate(${ring.angle} ${centerX} ${centerY})`}
          >
            <textPath href={`#${ring.id}`}>{ring.text}</textPath>
          </text>
        ))}
      </g>
    </svg>
  );
}
