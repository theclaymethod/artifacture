import { useState } from 'react';
import { Deck, usePresentationStateNavigation, type Slide } from './deck';
import Opening from './opening.mdx';

function Ownership() {
  const [step, setStep] = useState(0);
  const states = usePresentationStateNavigation({ index: step, count: 3, onChange: setStep });
  const labels = ['Your editable source', 'Your project configuration', 'Your rendered artifact'];
  return <div {...states}>
    <h1>One project owns the whole path.</h1>
    <div className="flow" aria-label="Source to output">
      {labels.map((label, index) => <div key={label} className="boundary" data-active={index <= step}>{label}</div>)}
    </div>
    <p aria-live="polite">{[
      'Write compact MDX or arbitrary React. Bring your own figures and presenter.',
      'Preview and export use the same Vite configuration, dependencies and assets.',
      'Deliver the result, with native video projects when the story needs motion.',
    ][step]}</p>
    <button onClick={() => setStep(value => (value + 1) % 3)}>Continue the explanation</button>
  </div>;
}
function Delivery() {
  return <><h1>Compose with what already works.</h1><p>Use native figures, keep the source editable, and let each renderer own its output.</p><details><summary>What can I customize?</summary><p>Every slide component, the presenter, theme, dependencies and Vite configuration. This template is ordinary source.</p></details></>;
}
const slides: Slide[] = [
  { id: 'question', title: 'The question', component: Opening },
  { id: 'ownership', title: 'The mechanism', component: Ownership },
  { id: 'delivery', title: 'The consequence', component: Delivery },
];
export default function App() { return <Deck slides={slides} />; }
