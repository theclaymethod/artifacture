// Banner poster for README header — Mono-Industrial aesthetic.
// Canvas: 1792×592 (3.03:1) to match the existing banner.png dimensions.
// Rendered via: poster export banner.tsx -o banner.png

const BG = "#000000";
const FG = "#f2ede5";
const T_PRIMARY   = "rgba(242, 237, 229, 0.90)";
const T_SECONDARY = "rgba(242, 237, 229, 0.58)";
const T_DISABLED  = "rgba(242, 237, 229, 0.36)";
const RULE        = "rgba(242, 237, 229, 0.14)";

const SG = "'Space Grotesk', system-ui, sans-serif";
const SM = "'Space Mono', 'SF Mono', Consolas, monospace";
const GP = "'Geist Pixel Square', 'Space Grotesk', system-ui, sans-serif";

const FONTS_LINK = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500&family=Space+Mono:wght@400;700&display=swap";

const GEIST_PIXEL_FACE = `
  @font-face {
    font-family: 'Geist Pixel Square';
    src: url('https://cdn.jsdelivr.net/npm/geist@1.7.0/dist/fonts/geist-pixel/GeistPixel-Square.woff2') format('woff2');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
`;

// The eight output modes the skill can produce — shown as a hairline-separated
// tag strip along the bottom. This is the "moment of surprise" via density:
// eight discrete outputs in a single row instead of one oversized headline.
const CAPABILITIES = [
  "DIAGRAM",
  "SLIDES",
  "MAGAZINE",
  "POSTER",
  "VIDEO · LONG-FORM",
  "VIDEO · REEL",
  "PDF",
  "UI DEMO",
];

export default function Banner() {
  return (
    <div
      className="w-[1792px] h-[592px] relative overflow-hidden"
      style={{ background: BG, color: FG, fontFamily: SG }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href={FONTS_LINK} rel="stylesheet" />
      <style>{GEIST_PIXEL_FACE}</style>

      {/* ===== Metadata row — eyebrow top-left, version top-right ===== */}
      <div
        className="absolute top-[48px] left-[72px] right-[72px] flex items-center justify-between"
        style={{ fontFamily: SM, fontSize: 13, letterSpacing: "0.14em", color: T_SECONDARY }}
      >
        <span>VISUAL-EXPLAINER / CLI SKILL</span>
        <span>MONO-INDUSTRIAL · V 2.6</span>
      </div>

      {/* ===== Headline — oversized, left-anchored ===== */}
      <div
        className="absolute left-[72px]"
        style={{ top: 150 }}
      >
        <div
          style={{
            fontFamily: SG,
            fontWeight: 500,
            fontSize: 136,
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            color: FG,
          }}
        >
          visual-explainer.
        </div>
        <div
          style={{
            marginTop: 28,
            fontFamily: SG,
            fontWeight: 400,
            fontSize: 22,
            lineHeight: 1.45,
            color: T_PRIMARY,
            maxWidth: 780,
          }}
        >
          Turn complex terminal output into self-contained HTML, PDFs,
          posters, and explainer MP4s. One skill, eight output shapes.
        </div>
      </div>

      {/* ===== Moment of surprise — Geist Pixel "08" on the right edge ===== */}
      <div
        className="absolute"
        style={{
          top: 148,
          right: 72,
          textAlign: "right",
          fontFamily: GP,
          fontWeight: 400,
          fontSize: 260,
          lineHeight: 0.88,
          color: FG,
        }}
      >
        08
      </div>
      <div
        className="absolute"
        style={{
          top: 410,
          right: 72,
          textAlign: "right",
          fontFamily: SM,
          fontSize: 12,
          letterSpacing: "0.18em",
          color: T_DISABLED,
        }}
      >
        OUTPUT MODES
      </div>

      {/* ===== Hairline + capability strip along the bottom ===== */}
      <div
        className="absolute left-[72px] right-[72px]"
        style={{ bottom: 72, borderTop: `1px solid ${RULE}` }}
      />
      <div
        className="absolute left-[72px] right-[72px] flex items-center justify-between"
        style={{
          bottom: 36,
          fontFamily: SM,
          fontSize: 12,
          letterSpacing: "0.14em",
          color: T_SECONDARY,
        }}
      >
        {CAPABILITIES.map((cap, i) => (
          <span key={i} style={{ whiteSpace: "nowrap" }}>
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}
