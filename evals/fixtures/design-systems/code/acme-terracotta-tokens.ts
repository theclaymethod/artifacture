// Eval fixture: a SYNTHETIC brand token module for the invented
// "Acme Terracotta" design system. All values are made up; the file mirrors
// the structural shapes ve:learn's code extractor must handle in the wild —
// a named colors object, alpha-suffix tint idioms, font stacks, a signature
// easing constant, a numeric type ramp, tone records, and a grid-paper
// helper. Golden expectations live in ../expected/acme-terracotta-tokens.json.
//
// The palette is chosen so the mapper exercises every decision path:
//   name hints            paper->bg, ink->text, surface->panel, border->rule,
//                         primary->accent, night->bg-alt
//   contrast ranking      gray vs muted (darker wins --ve-muted, other
//                         becomes --ve-faint)
//   status name hints     success/info/warning
//   hue classification    ember (reddish, no hinted name) -> danger
//   defaults              heading<-text, accent-contrast, radius 0px
//   numeric extraction    weight mode 350, 32px grid at .45 line alpha, ease
import type { CSSProperties } from "react";

export const colors = {
  paper: "#F7F3EA",
  surface: "#EDE7D8",
  border: "#C9C2B4",
  ink: "#26282D",
  gray: "#57595B",
  muted: "#7B7D80",
  primary: "#C05F33",
  ember: "#96412F",
  success: "#5FA97C",
  info: "#4A86C8",
  warning: "#CC9F45",
  night: "#33363E",
};

/** Alpha-suffix tinting idiom: tint(colors.primary, "10") → "#C05F3310" */
export const tint = (color: string, alphaHex: string) => `${color}${alphaHex}`;

/**
 * Opaque equivalent of tint(): composites fg at the given hex alpha over an
 * opaque bg and returns the resulting SOLID hex (fills over grid backdrops
 * must be fully opaque).
 */
export const solidTint = (fg: string, bg: string, alphaHex: string) => {
  const a = parseInt(alphaHex, 16) / 255;
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(a * ch(fg, i) + (1 - a) * ch(bg, i))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
};

export const fonts = {
  display: "'Tiempos Headline','Lora',Georgia,serif",
  body: "'Karla', ui-sans-serif, system-ui, sans-serif",
  mono: "'Recursive Mono','Space Mono',ui-monospace,Menlo,monospace",
};

export const EASE = "cubic-bezier(0.33,1,0.68,1)";

/** Type ramp for the fixed presentation canvas. */
export const typeRamp = {
  title: { fontFamily: fonts.display, fontWeight: 350, fontSize: 72, lineHeight: 0.95, letterSpacing: 0 },
  titleWide: { fontFamily: fonts.display, fontWeight: 350, fontSize: 66, lineHeight: 0.97, letterSpacing: 0 },
  claim: { fontSize: 32, lineHeight: 1.25 },
  body: { fontSize: 24, lineHeight: 1.35 },
  bodySmall: { fontSize: 17, lineHeight: 1.4 },
  metric: { fontFamily: fonts.display, fontWeight: 350, fontSize: 44, lineHeight: 1 },
  label: { fontSize: 12, fontWeight: 650, textTransform: "uppercase" as const },
  monoLabel: { fontFamily: fonts.mono, fontSize: 12, textTransform: "uppercase" as const },
} satisfies Record<string, CSSProperties>;

export type Tone = "paper" | "night" | "primary";

export interface ToneVals {
  bg: string;
  fg: string;
  hair: string;
  mut: string;
}

export const TONES: Record<Tone, ToneVals> = {
  paper: { bg: colors.paper, fg: colors.ink, hair: colors.border, mut: colors.muted },
  night: { bg: colors.night, fg: colors.paper, hair: "rgba(247,243,234,.24)", mut: "rgba(247,243,234,.6)" },
  primary: { bg: colors.primary, fg: colors.paper, hair: "rgba(247,243,234,.36)", mut: "rgba(247,243,234,.7)" },
};

/** Grid-paper backdrop for diagram areas (32px grid). */
export const gridPaper = (line = "rgba(201,194,180,.45)"): CSSProperties => ({
  backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
  backgroundSize: "32px 32px",
});

/** Injected once by the deck root (extractor must ignore template literals). */
export const GLOBAL_CSS = `
html, body, #root { margin: 0; padding: 0; height: 100%; background: #1d1c1a; }
* { box-sizing: border-box; }
button:focus-visible { outline: 2px solid ${colors.primary}; outline-offset: 3px; }
@keyframes acmeSlideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
`;
