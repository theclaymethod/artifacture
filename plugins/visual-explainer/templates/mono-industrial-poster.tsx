// Mono-Industrial poster reference for poster-ai.
// Build:   poster build templates/mono-industrial-poster.tsx -o /tmp/poster.html
// Export:  poster export templates/mono-industrial-poster.tsx -o /tmp/poster.png
//
// Canvas is 1600×1000 — standard landscape. Adjust w-[1200px] h-[1500px]
// for portrait, or w-[1200px] h-[628px] for social-card ratios.
// Content that overflows the canvas is clipped on export; design to fit.
//
// Aesthetic: see references/mono-industrial.md.
// - 2 font families (Space Grotesk + Space Mono) + 1 Geist Pixel accent (hero only)
// - grayscale text tiers, status colors only
// - spacing-grouped sections, no cards, no borders (except hairlines)
// - exactly one moment of surprise (here: the 1.2M Geist Pixel number)

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400;700&display=swap";

// Geist Pixel ships via npm (jsDelivr CDN), not Google Fonts. Inject @font-face inline.
const GEIST_PIXEL_FACE = `
  @font-face {
    font-family: 'Geist Pixel Square';
    src: url('https://cdn.jsdelivr.net/npm/geist@1.7.0/dist/fonts/geist-pixel/GeistPixel-Square.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
`;

const SG = "'Space Grotesk', system-ui, sans-serif";
const SM = "'Space Mono', 'SF Mono', Consolas, monospace";
const GP = "'Geist Pixel Square', 'Space Grotesk', system-ui, sans-serif";

// Tokens — mirror the CSS tokens in references/mono-industrial.md
const BG = "#000000";
const FG = "rgba(242, 237, 229, 1.00)";
const T_PRIMARY = "rgba(242, 237, 229, 0.90)";
const T_SECONDARY = "rgba(242, 237, 229, 0.58)";
const T_DISABLED = "rgba(242, 237, 229, 0.36)";
const RULE = "rgba(242, 237, 229, 0.14)";
const OK = "#6bd48e";
const WARN = "#f0b05a";

type Module = { tag: string; name: string; desc: string };
const modules: Module[] = [
  {
    tag: "Write · Svc",
    name: "Gateway",
    desc: "HTTP ingress. Validates, rate-limits, then writes to the ledger. Returns 2xx only after durable ack from a quorum of ledger replicas.",
  },
  {
    tag: "Store · Core",
    name: "Ledger",
    desc: "Append-only log, sharded by tenant. No reads from producers. Retention is configurable per shard; audit retention is pinned at 7 years.",
  },
  {
    tag: "Read · Svc",
    name: "Indexer",
    desc: "Consumes the ledger tail and maintains secondary indexes. Cold-starts by full replay; recovers on its own after any failure.",
  },
  {
    tag: "Read · Svc",
    name: "Query API",
    desc: "Serves admin UI and internal tools. Reads only from indexer state; never touches the ledger directly. No writes.",
  },
];

type LatencyRow = {
  hop: string;
  target: string;
  p99: number;
  status: "WITHIN" | "OVER";
  color: string;
};
const latency: LatencyRow[] = [
  { hop: "Client → Gateway", target: "≤ 15 ms", p99: 12, status: "WITHIN", color: OK },
  { hop: "Gateway validate", target: "≤ 10 ms", p99: 9, status: "WITHIN", color: OK },
  { hop: "Ledger quorum ack", target: "≤ 40 ms", p99: 47, status: "OVER", color: WARN },
  { hop: "Gateway → Client", target: "≤ 15 ms", p99: 11, status: "WITHIN", color: OK },
  { hop: "End-to-end", target: "≤ 80 ms", p99: 79, status: "WITHIN", color: OK },
];

function MetaLabel({ index, label, right }: { index: string; label: string; right: string }) {
  return (
    <div
      className="flex justify-between items-baseline pt-4 mb-8"
      style={{
        fontFamily: SM,
        fontSize: 12,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: T_SECONDARY,
        borderTop: `1px solid ${RULE}`,
      }}
    >
      <span>
        <span style={{ color: T_DISABLED }}>{index}</span>&nbsp;&nbsp;{label}
      </span>
      <span>{right}</span>
    </div>
  );
}

export default function MonoIndustrialPoster() {
  return (
    <div
      className="w-[1600px] h-[1000px] flex flex-col"
      style={{
        background: BG,
        color: T_PRIMARY,
        fontFamily: SG,
        padding: "64px 80px",
        gap: 32,
      }}
    >
      <link href={FONTS_HREF} rel="stylesheet" />
      <style>{GEIST_PIXEL_FACE}</style>
        {/* Metadata row */}
        <header
          className="flex justify-between items-baseline pb-4"
          style={{
            fontFamily: SM,
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: T_SECONDARY,
            borderBottom: `1px solid ${RULE}`,
          }}
        >
          <span>Request Ledger / Architecture</span>
          <div className="flex" style={{ gap: 32 }}>
            <span>v 2.4.0</span>
            <span>2026 · 04 · 16</span>
          </div>
        </header>

        {/* Hero: headline left, Geist Pixel number right (the one moment of surprise) */}
        <section className="grid grid-cols-[1fr_auto] items-end" style={{ gap: 48, paddingTop: 16 }}>
          <div>
            <h1
              style={{
                fontFamily: SG,
                fontSize: 56,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.02,
                color: FG,
                maxWidth: "18ch",
              }}
            >
              A write-first ledger for request and response telemetry.
            </h1>
            <p
              style={{
                marginTop: 20,
                maxWidth: "52ch",
                fontSize: 18,
                lineHeight: 1.55,
                color: T_SECONDARY,
              }}
            >
              Every inbound request is logged to append-only storage before any handler runs.
              Downstream services read from the ledger, never from the request stream directly.
            </p>
          </div>
          <div className="text-right">
            <div
              style={{
                fontFamily: GP,
                fontSize: 180,
                fontWeight: 400,
                lineHeight: 0.9,
                letterSpacing: "-0.02em",
                color: FG,
              }}
            >
              1.2M
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: SM,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: T_SECONDARY,
              }}
            >
              Events / sec — peak
            </div>
          </div>
        </section>

        {/* Section 02: Modules — spacing-grouped, no cards */}
        <section style={{ marginTop: 8 }}>
          <MetaLabel index="02" label="Modules" right="4 services" />
          <div
            className="grid grid-cols-4"
            style={{ gap: 40 }}
          >
            {modules.map((m) => (
              <div key={m.name}>
                <div
                  style={{
                    fontFamily: SM,
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: T_SECONDARY,
                    marginBottom: 8,
                  }}
                >
                  {m.tag}
                </div>
                <div
                  style={{
                    fontFamily: SG,
                    fontSize: 20,
                    fontWeight: 500,
                    color: FG,
                    marginBottom: 8,
                  }}
                >
                  {m.name}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: T_SECONDARY,
                    maxWidth: "30ch",
                  }}
                >
                  {m.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 03: Latency table — no zebra, tabular nums, status on value only */}
        <section style={{ marginTop: 16 }}>
          <MetaLabel index="03" label="Latency Budget" right="p99 / 24h" />
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr
                style={{
                  fontFamily: SM,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: T_SECONDARY,
                  borderBottom: `1px solid ${RULE}`,
                }}
              >
                <th style={{ textAlign: "left", padding: "8px 16px 8px 0", fontWeight: 400 }}>Hop</th>
                <th style={{ textAlign: "left", padding: "8px 16px 8px 0", fontWeight: 400 }}>Target</th>
                <th
                  style={{
                    textAlign: "right",
                    padding: "8px 16px 8px 0",
                    fontWeight: 400,
                    fontFamily: SM,
                  }}
                >
                  p99 (ms)
                </th>
                <th style={{ textAlign: "left", padding: "8px 0", fontWeight: 400 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {latency.map((r) => (
                <tr key={r.hop} style={{ borderTop: `1px solid ${RULE}`, color: T_PRIMARY }}>
                  <td style={{ padding: "14px 16px 14px 0" }}>{r.hop}</td>
                  <td style={{ padding: "14px 16px 14px 0" }}>{r.target}</td>
                  <td
                    style={{
                      padding: "14px 16px 14px 0",
                      textAlign: "right",
                      fontFamily: SM,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.p99}
                  </td>
                  <td
                    style={{
                      padding: "14px 0",
                      fontFamily: SM,
                      fontSize: 12,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: r.color,
                    }}
                  >
                    {r.status === "OVER" ? "OVER · 17%" : r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <footer
          className="mt-auto flex justify-between"
          style={{
            paddingTop: 16,
            fontFamily: SM,
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: T_DISABLED,
            borderTop: `1px solid ${RULE}`,
          }}
        >
          <span>visual-explainer · Mono-Industrial · poster</span>
          <span>End of document</span>
        </footer>
    </div>
  );
}
