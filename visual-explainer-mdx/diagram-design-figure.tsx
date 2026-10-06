import { useMemo } from 'react';
import { SourceFigure, type SourceDocument } from './source-figure';
import { diagramDesignExamples, type DiagramDesignExample } from './diagram-design-examples';

export type DiagramDesignFigureProps = Readonly<{
  example: DiagramDesignExample;
  height?: number;
  title?: string;
  seconds?: number;
}>;

/** The original document retains its SVG paths, shading, typography and motion controller. */
export function DiagramDesignFigure({ example, height = 640, title, seconds }: DiagramDesignFigureProps) {
  const figure = diagramDesignExamples[example];
  if (!figure) throw new Error('Unknown Diagram Design example.');
  if (!Number.isFinite(height) || height < 200 || height > 2400) throw new Error('Figure height must be from 200 to 2400 pixels.');
  const asset = useMemo(() => ({...diagramDesignSource(example), title: title ?? figure.title}), [example, figure, title]);
  return <SourceFigure asset={asset} height={height} seconds={seconds} />;
}

export { diagramDesignExamples, type DiagramDesignExample } from './diagram-design-examples';

export function diagramDesignSource(example: DiagramDesignExample): SourceDocument {
 const figure = diagramDesignExamples[example];
 if (!figure) throw new Error('Unknown Diagram Design example.');
 return { title: figure.title, html: figure.html, timing: figure.html.includes('function play(fromStart = false, userInitiated = false) {') ? 'diagram-design' : figure.html.includes('<script') ? 'native' : 'static', source: 'https://github.com/cathrynlavery/diagram-design', revision: '3996c1607503ec4bcdb60b018568359d20f71d15' };
}
