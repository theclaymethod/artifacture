import { useMemo } from 'react';
import { SourceFigure, type SourceDocument } from './source-figure';
import { chalkboardExamples, type ChalkboardExample } from './chalkboard-examples';
export { chalkboardExamples };
export type { ChalkboardExample };

/** Original code/geometry/controller; typography requires a separately licensed PencilPete font. */
export function ChalkboardFigure({ example, height = 800, seconds }: { example: ChalkboardExample; height?: number; seconds?: number }) {
  const figure = chalkboardExamples[example];
  if (!figure) throw new Error(`Unknown Chalkboarding example: ${example}`);
  if (!Number.isFinite(height) || height < 200 || height > 2400) throw new Error('ChalkboardFigure height must be 200–2400 pixels.');
  const asset = useMemo<SourceDocument>(() => ({title: figure.title, html: figure.html, timing: figure.html.includes('function paint(t)') && figure.html.includes('function play(){') ? 'chalkboarding' : 'native', source: 'https://github.com/lilyzhng/chalkboarding', revision: 'f6af618a5a5642861a04f3d16b8a90c891177269'}), [figure]);
  return <SourceFigure asset={asset} height={height} seconds={seconds} />;
}
