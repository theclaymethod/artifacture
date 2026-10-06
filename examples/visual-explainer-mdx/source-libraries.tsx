import { useState } from 'react';
import { PresentationDeck, PresentationSlide } from '../../visual-explainer-mdx/components';
import { DiagramDesignFigure } from '../../visual-explainer-mdx/diagram-design-figure';
import { PrLensFigure } from '../../visual-explainer-mdx/pr-lens-figure';
import { Exploded } from '../../visual-explainer-mdx/hairline-figures';

export default function SourceLibraries() {
  const [seconds, setSeconds] = useState(0);
  const clock = <label style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 26 }}>Time <input aria-label="Source time" type="range" min={0} max={6} step={0.01} value={seconds} onChange={event => setSeconds(Number(event.target.value))} style={{ width: 480 }} />{seconds.toFixed(2)} s</label>;
  return <PresentationDeck title="Original figures, shared presentation controls" preset="hairline">
    <PresentationSlide shortTitle="Exploded view" tone="light">
      <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: 20 }}>
        <DiagramDesignFigure example="exploded-phone-animated" seconds={seconds} height={840} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{clock}<a href="https://github.com/cathrynlavery/diagram-design" style={{ fontSize: 24 }}>Diagram Design · Cathryn Lavery</a></div>
      </div>
    </PresentationSlide>
    <PresentationSlide title="Follow the original data-flow pulses" shortTitle="Data flow" tone="light">
      <PrLensFigure example="postmark-refactor/data-flow/send-pipeline-view/light" seconds={seconds} height={650} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{clock}<a href="https://github.com/coldteadotai/pr-lens" style={{ fontSize: 24 }}>PR Lens · Coldtea AI</a></div>
    </PresentationSlide>
    <PresentationSlide title="Keep the original pointer interaction" shortTitle="Hairline" tone="light">
      <div style={{ width: 850, margin: '0 auto' }}><Exploded theme="light" intensity={0.5} label="Exploded application window" /></div>
      <p style={{ fontSize: 28 }}>Move across the figure to explore its layers. Hairline owns its springs and pointer response.</p>
      <a href="https://github.com/lucasmarkes/hairline" style={{ fontSize: 24 }}>Hairline · Lucas Markes</a>
    </PresentationSlide>
  </PresentationDeck>;
}
