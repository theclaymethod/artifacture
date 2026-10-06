import { useMemo } from 'react';
import { SourceFigure, type SourceDocument } from './source-figure';
import { prLensExamples, type PrLensExample } from './pr-lens-examples';

export { prLensExamples };
export type { PrLensExample };

/** The upstream renderer owns every SVG coordinate, type choice and SMIL pulse. */
export function PrLensFigure({ example, label, seconds, height = 640 }: { example: PrLensExample; label?: string; seconds?: number; height?: number }) {
  const figure = prLensExamples[example];
  if (!figure) throw new Error(`Unknown PR Lens example: ${example}`);
  const asset = useMemo<SourceDocument>(() => ({title: label ?? figure.title, html: figure.svg, timing: 'smil', source: 'https://github.com/coldteadotai/pr-lens', revision: '7a9115c8202da4db030be5954ada8862e6135dce'}), [figure, label]);
  if (seconds !== undefined) return <SourceFigure asset={asset} seconds={seconds} height={height} />;
  return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(figure.svg)}`} alt={label ?? `${figure.title}: ${figure.lens}, ${figure.theme}`} width={figure.width} height={figure.height} style={{ display: 'block', maxWidth: '100%', height: 'auto' }} />;
}
