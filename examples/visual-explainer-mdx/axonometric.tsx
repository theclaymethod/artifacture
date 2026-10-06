import React, { useState } from 'react';
import { DiagramDesignFigure, type DiagramDesignExample } from '../../visual-explainer-mdx/diagram-design-figure';

const examples: readonly DiagramDesignExample[] = ['axonometric-plan', 'axonometric-plan-campus-animated', 'axonometric-plan-coffee-shop-animated', 'exploded-phone-animated', 'exploded-keyboard-animated', 'exploded-unboxing-animated'];
export default function AxonometricExamples() {
 const [example, setExample] = useState<DiagramDesignExample>('exploded-phone-animated');
 return <main style={{ maxWidth: 1200, margin: 'auto', padding: 24 }}>
 <h1>Diagram Design originals</h1>
 <label>Example <select value={example} onChange={e => { const value = e.target.value; const match = examples.find(name => name === value); if (match) setExample(match); }}>{examples.map(name => <option key={name}>{name}</option>)}</select></label>
 <DiagramDesignFigure key={example} example={example} height={900} />
 <p>Original geometry, typography, colors and animation by <a href="https://github.com/cathrynlavery/diagram-design">Cathryn Lavery</a>, MIT. The complete source skill and builders are included.</p>
 </main>;
}
