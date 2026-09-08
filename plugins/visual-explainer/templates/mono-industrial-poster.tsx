// Original 1600 × 1000 poster. Replace illustrative timings with measured data.
// Build: poster build templates/mono-industrial-poster.tsx -o /tmp/poster.html
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400&display=swap';
const BODY = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'Space Mono', monospace";
const PAPER = '#f6f4f0';
const INK = '#16130f';
const MUTED = '#625e57';
const RULE = '#c7c2b9';

const modules = [
  { name: 'Gateway', desc: 'Validate the request. Return success only after a quorum acknowledges the write.' },
  { name: 'Ledger', desc: 'Keep an append-only record, partitioned by tenant.' },
  { name: 'Indexer', desc: 'Build query indexes from the ledger. Recover by replaying retained records.' },
  { name: 'Query API', desc: 'Serve requests from indexer state.' },
];
const latency = [
  { hop: 'Client to gateway', target: 15, observed: 12 },
  { hop: 'Validation', target: 10, observed: 9 },
  { hop: 'Ledger acknowledgement', target: 40, observed: 47 },
  { hop: 'Gateway to client', target: 15, observed: 11 },
];

export default function MonoIndustrialPoster() {
  return (
    <main className="w-[1600px] h-[1000px]" style={{ background: PAPER, color: INK, fontFamily: BODY, padding: '64px 80px' }}>
      <link href={FONTS_HREF} rel="stylesheet" />
      <header style={{ maxWidth: 1140, marginBottom: 48 }}>
        <h1 style={{ fontSize: 64, fontWeight: 500, lineHeight: 1.06, letterSpacing: '-.025em', margin: 0, maxWidth: '24ch' }}>Write each request before handling it.</h1>
        <p style={{ marginTop: 24, maxWidth: '65ch', fontSize: 22, lineHeight: 1.55, color: MUTED }}>An illustrative request ledger. Persist each request before consumers build indexes and serve queries.</p>
      </header>
      <section aria-label="Request flow" style={{ marginBottom: 48 }}>
        <svg viewBox="0 0 1440 154" style={{ display: 'block', width: '100%', height: 154 }} role="img" aria-labelledby="poster-flow-title poster-flow-desc">
          <title id="poster-flow-title">Gateway to ledger to indexer to query API</title>
          <desc id="poster-flow-desc">Requests are persisted in the ledger before the indexer and query API consume them.</desc>
          <defs><marker id="poster-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={MUTED} /></marker></defs>
          {[280, 660, 1040].map(x => <path key={x} d={`M ${x} 62 H ${x + 99}`} fill="none" stroke={MUTED} strokeWidth="1.5" markerEnd="url(#poster-arrow)" />)}
          {modules.map((module, i) => <g key={module.name}><rect x={i * 380} y="12" width="280" height="100" rx="10" fill={PAPER} stroke={i === 1 ? INK : RULE} strokeWidth="1.5" /><text x={i * 380 + 140} y="71" textAnchor="middle" fill={INK} fontSize="25" fontFamily={BODY}>{module.name}</text></g>)}
        </svg>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 40 }}>
          {modules.map(module => <p key={module.name} style={{ margin: 0, color: MUTED, fontSize: 18, lineHeight: 1.6 }}>{module.desc}</p>)}
        </div>
      </section>
      <section style={{ borderTop: `1px solid ${RULE}`, paddingTop: 28, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 56 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 500, lineHeight: 1.2 }}>The write path has an 80 ms budget.</h2>
          <p style={{ color: MUTED, fontSize: 18, lineHeight: 1.6, marginTop: 20 }}>Illustrative P99 timings: ledger acknowledgement exceeds its allocation; the full request stays within budget.</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 18 }}>
          <thead><tr>{['Hop', 'Target', 'Observed'].map(label => <th key={label} style={{ textAlign: label === 'Hop' ? 'left' : 'right', padding: '0 0 14px', fontWeight: 500, color: MUTED }}>{label}</th>)}</tr></thead>
          <tbody>{latency.map(row => <tr key={row.hop} style={{ borderTop: `1px solid ${RULE}` }}><td style={{ padding: '16px 0' }}>{row.hop}</td><td style={{ textAlign: 'right', fontFamily: MONO }}>{row.target} ms</td><td style={{ textAlign: 'right', fontFamily: MONO }}>{row.observed} ms{row.observed > row.target ? ' — over budget' : ''}</td></tr>)}</tbody>
        </table>
      </section>
    </main>
  );
}
