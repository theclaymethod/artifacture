// A path or a name in monospace that wraps only at its own joints, never inside a word.
import { Fragment } from 'react';
import './breakable.css';

/** One word: a path breaks after each `/`, a name after each `_` or `-`; each part stays whole. */
function Word({ text }: { text: string }) {
  const parts = text.split(text.includes('/') ? /(?<=\/)/ : /(?<=[_-])/);
  if (parts.length < 2) return <span className="ve-nobreak">{text}</span>;
  return <>{parts.map((part, i) => <Fragment key={i}>{i ? <wbr /> : null}<span className="ve-nobreak">{part}</span></Fragment>)}</>;
}

/**
 * A path, a name or a short code value that wraps only at its own joints: at a space, after each
 * `/` of a path, or after each `_` or `-` of a name. A part between two joints never breaks, so
 * `false` or `value_mismatch` stays whole.
 */
export function Breakable({ text }: { text: string }) {
  if (!/\s/.test(text)) return <Word text={text} />;
  return <>{text.split(/(\s+)/).map((part, i) => (i % 2 ? part : part ? <Word key={i} text={part} /> : null))}</>;
}
