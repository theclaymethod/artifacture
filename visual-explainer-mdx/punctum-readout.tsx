import type { CSSProperties } from 'react';
import { punctumAxes, punctumLines } from './punctum-text';
import './punctum-readout.css';

export type PunctumReadoutProps = Readonly<{ text: string; weight?: number; roundness?: number; size?: number; accent?: boolean }>;

export function PunctumReadout({ text, weight = 400, roundness = 100, size = 48, accent = false }: PunctumReadoutProps) {
  punctumLines(text); punctumAxes(weight, roundness);
  if (!Number.isFinite(size) || size < 8 || size > 512) throw new Error('Readout size must be 8–512 CSS pixels.');
  const style: CSSProperties = { fontSize: size, fontWeight: weight, fontVariationSettings: `"wght" ${weight}, "ROND" ${roundness}`, color: accent ? 'var(--ve-accent)' : 'var(--ve-text)' };
  return <span className="ve-punctum-readout" style={style}>{text}</span>;
}

export async function awaitPunctumFont(text: string): Promise<void> {
  punctumLines(text);
  if (!globalThis.document) throw new Error('Punctum font readiness requires a browser document.');
  const loaded = await document.fonts.load('400 32px "Punctum"', text);
  if (!loaded.length || !document.fonts.check('400 32px "Punctum"', text)) throw new Error('The bundled Punctum font did not load.');
}
