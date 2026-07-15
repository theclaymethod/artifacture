// Design-system registry loader.
//
// A design system is a user-owned directory (one per system) containing:
//   tokens.css     — `--ve-*` custom properties, inside a `:root { ... }` block
//                    (or bare declarations); the loader re-scopes them to
//                    `[data-ve-preset="<name>"]` when inlining.
//   manifest.json  — name, description, source provenance, font loads and
//                    fallbacks, plus free-form notes (e.g. hard rules).
//
// Resolution order (first hit wins):
//   1. $ARTIFACTURE_DESIGN_DIR
//   2. ~/.artifacture/design-systems/
//   3. <repo>/design-systems/        (repo-local fallback, gitignored except
//                                     shipped examples)
//
// Collision note: ~/.artifacture may itself BE a clone of this repo. In that
// case path 2 and path 3 are the same directory; the search list is deduped
// so the directory is consulted exactly once, at the higher-priority slot.
// See docs/design-systems.md for the full contract.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BUILTIN_PRESETS = new Set([
  'mono-industrial',
  'nothing',
  'blueprint',
  'editorial',
  'paper-ink',
  'terminal',
  'custom',
]);

export const DEFAULT_FALLBACK_PRESET = 'mono-industrial';

// Token keys a complete design system is expected to provide (directly or via
// the derived fallbacks the exporter injects). Used for coverage reporting by
// the loader, `ve:learn`, and the design-system evals.
export const REQUIRED_VE_TOKENS = [
  '--ve-font-display',
  '--ve-font-body',
  '--ve-font-mono',
  '--ve-display-weight',
  '--ve-heading-weight',
  '--ve-radius',
  '--ve-bg',
  '--ve-bg-alt',
  '--ve-panel',
  '--ve-panel-strong',
  '--ve-row',
  '--ve-nav-bg',
  '--ve-review-bg',
  '--ve-rule',
  '--ve-heading',
  '--ve-text',
  '--ve-muted',
  '--ve-faint',
  '--ve-accent',
  '--ve-accent-soft',
  '--ve-accent-contrast',
  '--ve-info',
  '--ve-warn',
  '--ve-danger',
  '--ve-ok',
  '--ve-err',
  '--ve-diagram-bg',
  '--ve-grid-line',
  '--ve-node-bg',
  '--ve-node-stroke',
  '--ve-diagram-grid-size',
  '--ve-grid-dot-r',
  '--ve-grid-dot-opacity',
  '--ve-grid-line-opacity',
  '--ve-grid-scanline-opacity',
  '--ve-node-radius',
  '--ve-chip-radius',
  '--ve-code-bg',
  '--ve-code-text',
  '--ve-code-muted',
  '--ve-code-rule',
  '--ve-code-accent',
  '--ve-poster-bg',
  '--ve-poster-text',
  '--ve-poster-muted',
  '--ve-poster-rule',
  '--ve-poster-grid',
];

export class DesignSystemError extends Error {
  constructor(message, { name, dir } = {}) {
    super(message);
    this.name = 'DesignSystemError';
    this.systemName = name;
    this.dir = dir;
  }
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function assertValidSlug(name) {
  if (!SLUG_PATTERN.test(name)) {
    throw new DesignSystemError(
      `Invalid design-system name "${name}" — use a lowercase slug (letters, digits, hyphens).`,
      { name },
    );
  }
}

/**
 * Ordered, deduped list of registry directories to search.
 * Injectable env/home/repoRoot keep this testable without touching the
 * process environment.
 */
export function designSystemSearchPaths({
  env = process.env,
  home = os.homedir(),
  repoRoot = process.cwd(),
} = {}) {
  const paths = [];
  if (env.ARTIFACTURE_DESIGN_DIR) paths.push(path.resolve(env.ARTIFACTURE_DESIGN_DIR));
  paths.push(path.join(home, '.artifacture', 'design-systems'));
  paths.push(path.join(repoRoot, 'design-systems'));
  return [...new Set(paths)];
}

/**
 * Resolve `name` against the registry. Returns
 * `{ name, dir, tokensCss, manifest, searchPath }` or null when no registry
 * directory contains the system. A directory that EXISTS but is malformed
 * (missing tokens.css or manifest.json, or unparseable manifest) throws a
 * DesignSystemError — a half-formed system that would silently shadow a
 * lower-priority one is a footgun, so it fails loudly instead of skipping.
 */
export function resolveDesignSystem(name, opts = {}) {
  assertValidSlug(name);
  for (const searchPath of designSystemSearchPaths(opts)) {
    const dir = path.join(searchPath, name);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;

    const tokensPath = path.join(dir, 'tokens.css');
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(tokensPath)) {
      throw new DesignSystemError(
        `Design system "${name}" at ${dir} is missing tokens.css.`,
        { name, dir },
      );
    }
    if (!fs.existsSync(manifestPath)) {
      throw new DesignSystemError(
        `Design system "${name}" at ${dir} is missing manifest.json.`,
        { name, dir },
      );
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      throw new DesignSystemError(
        `Design system "${name}" at ${dir} has a malformed manifest.json: ${error.message}`,
        { name, dir },
      );
    }
    return {
      name,
      dir,
      searchPath,
      tokensCss: fs.readFileSync(tokensPath, 'utf8'),
      manifest,
    };
  }
  return null;
}

/** All resolvable system names across the search paths (for diagnostics). */
export function listDesignSystems(opts = {}) {
  const names = new Set();
  for (const searchPath of designSystemSearchPaths(opts)) {
    if (!fs.existsSync(searchPath)) continue;
    for (const entry of fs.readdirSync(searchPath, { withFileTypes: true })) {
      if (entry.isDirectory() && SLUG_PATTERN.test(entry.name)) names.add(entry.name);
    }
  }
  return [...names].sort();
}

const DECLARATION_PATTERN = /(--[\w-]+)\s*:\s*([^;}]+)/g;

/** Parse every custom-property declaration in a tokens.css text. */
export function parseTokenDeclarations(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = [];
  for (const match of withoutComments.matchAll(DECLARATION_PATTERN)) {
    declarations.push([match[1], match[2].trim()]);
  }
  return declarations;
}

/**
 * Re-scope a tokens.css file to `[data-ve-preset="<name>"]`. tokens.css is
 * declaration-only by contract (a `:root { ... }` block is the recommended
 * authoring form); any non-custom-property rules are ignored.
 */
export function scopeTokensCss(css, name) {
  const declarations = parseTokenDeclarations(css);
  if (declarations.length === 0) {
    throw new DesignSystemError(
      `Design system "${name}" tokens.css contains no custom-property declarations.`,
      { name },
    );
  }
  const body = declarations.map(([prop, value]) => `  ${prop}: ${value};`).join('\n');
  return `[data-ve-preset="${name}"] {\n${body}\n}`;
}

// Derived diagram fallbacks mirroring global.css's built-in
// [data-ve-preset="custom"] block, emitted BEFORE the user tokens so an
// explicit token in tokens.css always wins.
const DERIVED_FALLBACKS = [
  '--ve-diagram-ink: var(--ve-heading)',
  '--ve-diagram-muted: var(--ve-muted)',
  '--ve-diagram-frame: var(--ve-rule)',
  '--ve-diagram-accent-fill: color-mix(in srgb, var(--ve-accent) 14%, transparent)',
];

/**
 * Full CSS text to inline for a resolved system: optional font @imports from
 * the manifest, then derived fallbacks + tokens scoped to the preset name.
 */
export function designSystemStyleCss(system) {
  const imports = (system.manifest?.fonts?.imports ?? [])
    .map((url) => `@import url('${url}');`)
    .join('\n');
  const fallbacks = DERIVED_FALLBACKS.map((line) => `  ${line};`).join('\n');
  const scoped = scopeTokensCss(system.tokensCss, system.name).replace(
    '{\n',
    `{\n${fallbacks}\n`,
  );
  // Name only — no local filesystem paths in a shareable artifact.
  const header = `/* artifacture design system: ${system.name} */`;
  return [header, imports, scoped].filter(Boolean).join('\n');
}

/** Which REQUIRED_VE_TOKENS a tokens.css leaves unset (derived ones excluded). */
export function missingRequiredTokens(css) {
  const provided = new Set(parseTokenDeclarations(css).map(([prop]) => prop));
  return REQUIRED_VE_TOKENS.filter((token) => !provided.has(token));
}

// Preset names referenced by an MDX/TSX source: data-ve-preset attributes and
// `preset` props/keys with a string-literal value (preset="x", preset={'x'},
// preset: 'x').
const PRESET_REFERENCE_PATTERNS = [
  /data-ve-preset\s*=\s*[{]?\s*["']([\w-]+)["']/g,
  /\bpreset\s*[:=]\s*[{]?\s*["']([\w-]+)["']/g,
];

export function presetNamesInSource(code) {
  const names = new Set();
  for (const pattern of PRESET_REFERENCE_PATTERNS) {
    for (const match of code.matchAll(pattern)) names.add(match[1]);
  }
  return [...names];
}

/**
 * Extract a built-in preset's token block from global.css and re-scope it to
 * `name` — the deterministic fallback when a preset is neither built in nor
 * in the registry (the artifact still renders with the default look instead
 * of unset tokens).
 */
export function builtinFallbackCss(name, globalCss, fallbackPreset = DEFAULT_FALLBACK_PRESET) {
  const pattern = new RegExp(`\\[data-ve-preset="${fallbackPreset}"\\]\\s*\\{([^}]*)\\}`);
  const match = globalCss.match(pattern);
  if (!match) {
    throw new DesignSystemError(
      `Could not find built-in preset "${fallbackPreset}" in global.css to use as a fallback.`,
      { name },
    );
  }
  return `/* unknown preset "${name}": falling back to built-in "${fallbackPreset}" tokens */\n[data-ve-preset="${name}"] {${match[1]}}`;
}

/**
 * Export-pipeline entry point. Scans a source for preset references, resolves
 * non-built-in names against the registry, and returns the CSS to inline plus
 * human-readable warnings. Unknown names fall back to the default built-in
 * tokens (with a warning); malformed systems keep throwing loudly.
 */
export function resolvePresetCssForExport(sourceCode, opts = {}) {
  const { globalCssPath } = opts;
  const styles = [];
  const warnings = [];
  for (const name of presetNamesInSource(sourceCode)) {
    if (BUILTIN_PRESETS.has(name)) continue;
    if (!SLUG_PATTERN.test(name)) continue;
    const system = resolveDesignSystem(name, opts);
    if (system) {
      const missing = missingRequiredTokens(system.tokensCss);
      // Derived fallbacks cover the diagram-ink family; anything else unset
      // is worth surfacing but not fatal.
      const uncovered = missing.filter((token) => !DERIVED_FALLBACKS.some((line) => line.startsWith(`${token}:`)));
      if (uncovered.length > 0) {
        warnings.push(
          `design system "${name}" leaves ${uncovered.length} recommended token(s) unset: ${uncovered.join(', ')}`,
        );
      }
      styles.push(designSystemStyleCss(system));
      continue;
    }
    const searched = designSystemSearchPaths(opts).join(', ');
    const available = listDesignSystems(opts);
    warnings.push(
      `unknown preset "${name}": not a built-in preset and not found in the design-system registry ` +
        `(searched: ${searched}${available.length ? `; available: ${available.join(', ')}` : ''}). ` +
        `Falling back to built-in "${DEFAULT_FALLBACK_PRESET}" tokens.`,
    );
    const globalCss = fs.readFileSync(globalCssPath, 'utf8');
    styles.push(builtinFallbackCss(name, globalCss));
  }
  return { css: styles.length ? styles.join('\n') : null, warnings };
}
