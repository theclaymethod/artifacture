import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const visualTypes = [
  "Architecture",
  "IT current-state",
  "Flowchart",
  "Sequence",
  "State machine",
  "ER / data model",
  "Timeline",
  "Swimlane",
  "Quadrant",
  "Radar / spider",
  "Loop / flywheel",
  "Nested",
  "Tree",
  "Org chart",
  "Layer stack",
  "Venn",
  "Pyramid / funnel",
  "Bar chart",
  "Line chart",
  "Gantt",
  "Scatter plot",
  "High-level stack",
  "Process",
  "Medallion",
  "Data flow",
  "DP integration",
  "DP security matrix",
];

const semanticPatterns = [
  "Fan-in queue / bottleneck",
  "Stage framework with semantic slots",
  "Unstructured input → structured artifact",
  "Paired policy-evaluation traces",
  "Secure paved road",
  "Governance / control catalog",
  "Compensating security layers",
];

test("diagram routing exposes the pinned 27 types and seven semantic patterns", async () => {
  const routing = await read("references/diagram-design.md");

  for (const type of visualTypes) assert.match(routing, new RegExp(`\\| ${type.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")} \\|`));
  for (const pattern of semanticPatterns) assert.match(routing, new RegExp(pattern.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));

  assert.match(routing, /semantic-pattern cap → selected-type cap → explicit import-detail override/);
  assert.match(routing, /a5e3978088cf89c7caff5c20cabd99fbc2a301de/);
  assert.match(routing, /copyright 2025 Cathryn Lavery/);
  assert.doesNotMatch(routing, /Cocoon AI/);
});

test("diagram route progressively discloses SVG guidance and stores Mermaid source as inert text", async () => {
  const [skill, card, builder, contract, components, css, mono, mermaid] = await Promise.all([
    read("SKILL.md"),
    read("cards/web-diagram.md"),
    read(".claude/agents/ve-diagram-builder.md"),
    read("references/section-contract.md"),
    read("references/components.md"),
    read("references/css-patterns.md"),
    read("templates/mono-industrial.html"),
    read("templates/mermaid-flowchart.html"),
  ]);

  assert.doesNotMatch(skill, /references\/diagram-design\.md/);
  assert.match(card, /references\/diagram-design\.md/);
  assert.match(card, /custom SVG geometry[\s\S]+references\/diagrams-svg\.md/);
  assert.match(builder, /accessible inline SVG by default/);
  assert.match(builder, /Mermaid only/);
  assert.match(contract, /Inline-SVG fragments return `\[\]`/);

  for (const source of [components, css, mono, mermaid]) {
    assert.doesNotMatch(source, /<script[^>]+type=["']text\/plain["'][^>]+diagram-source/i);
  }
  assert.match(contract, /<pre class="ve-diagram__source"/);
});

test("SVG starter resolves its accessible name and prefixes reusable IDs", async () => {
  const starter = await read("templates/svg-diagram-starter.html");
  const svg = starter.slice(starter.indexOf("<svg\n"), starter.indexOf("</svg>") + 6);

  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-labelledby="ve-reference-architecture-title ve-reference-architecture-desc"/);
  assert.ok(svg.indexOf("<title id=") < svg.indexOf("<desc id="));
  assert.ok(svg.indexOf("<desc id=") < svg.indexOf("<defs>"));

  for (const [, id] of svg.matchAll(/\bid="([^"]+)"/g)) {
    assert.match(id, /^ve-reference-architecture(?:-|$)/);
  }
  assert.doesNotMatch(svg, /\bid="(?:arrow|dots|sketchy)"/);
});

test("active diagram instructions contain no stale type count or executable source container", async () => {
  const files = await Promise.all([
    read("SKILL.md"),
    read("references/diagram-design.md"),
    read("references/diagrams-svg.md"),
    read("references/section-contract.md"),
    read(".claude/agents/ve-diagram-builder.md"),
  ]);
  const combined = files.join("\n");

  assert.doesNotMatch(combined, /13 supported/i);
  assert.doesNotMatch(combined, /<script[^>]+type=["']text\/plain["']/i);
});

test("every advertised section role maps to an available worker", async () => {
  const [command, contract] = await Promise.all([
    read("commands/generate-web-diagram.md"),
    read("references/section-contract.md"),
  ]);

  for (const specialist of ["ve-hero-builder", "ve-diagram-builder", "ve-table-builder"]) {
    await read(`.claude/agents/${specialist}.md`);
    assert.match(command, new RegExp(specialist));
    assert.match(contract, new RegExp(specialist));
  }

  for (const role of ["dashboard", "prose"]) {
    assert.match(command, new RegExp(`generic worker[^\\n]+${role}|${role}[^\\n]+generic worker`, "i"));
    assert.ok(contract.includes(`| \`${role}\` | generic worker`));
  }
  assert.doesNotMatch(`${command}\n${contract}`, /ve-(?:dashboard|prose)-builder/);
});

test("computed and Mermaid diagrams use accessible, strict SVG contracts", async () => {
  const components = await read("../../visual-explainer-mdx/components.tsx");
  const canvas = components.slice(components.indexOf("export function DiagramCanvas"), components.indexOf("function MobileSwimlaneVariant"));
  const mermaid = components.slice(components.indexOf("export function MermaidBlock"), components.indexOf("function DiagramNodeShape"));

  assert.match(canvas, /aria-labelledby=/);
  assert.ok(canvas.indexOf("<title id=") < canvas.indexOf("<desc id="));
  assert.ok(canvas.indexOf("<desc id=") < canvas.indexOf("<defs>"));
  assert.match(mermaid, /securityLevel: 'strict'/);
  assert.match(mermaid, /replaceChildren\(parseMermaidSvg/);
  assert.doesNotMatch(mermaid, /innerHTML/);
});
