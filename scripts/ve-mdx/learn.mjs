#!/usr/bin/env node
// ve:learn — learn a draft design system from a source and write it into the
// design-system registry for human/agent refinement.
//
//   npm run ve:learn -- <source> --name <slug> [--out <dir>] [--force]
//
// <source> is one of:
//   code   — a TS/JS/CSS file with token objects (hex colors, font stacks,
//            size ramps)
//   url    — an http(s) page; fetches the HTML plus linked CSS and extracts
//            :root custom properties, @font-face, and dominant colors
//   image  — a PNG/JPEG/WebP; palette quantization via a canvas rendered in
//            Playwright's bundled Chromium
//
// Output: <registry>/<slug>/{tokens.css,manifest.json} with provenance and an
// extraction report. Default registry dir: $ARTIFACTURE_DESIGN_DIR, else
// ~/.artifacture/design-systems. Heuristics are deterministic; the
// design-system evals (evals/design-systems/) are their spec.
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assertValidSlug, REQUIRED_VE_TOKENS } from './design-systems.mjs';
import {
  detectModality,
  extractFromCode,
  mapExtractionToCore,
  deriveTokens,
  tokensCssText,
} from './learn-extractors.mjs';
import { extractFromUrlSource, extractFromImageSource } from './learn-sources.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

function parseArgs(argv) {
  const args = [...argv];
  const source = args.shift();
  let name = null;
  let out = null;
  let force = false;
  let allowPrivate = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--name') name = args[++i];
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--force') force = true;
    else if (args[i] === '--allow-private') allowPrivate = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!source || !name) {
    throw new Error('Usage: npm run ve:learn -- <source> --name <slug> [--out <dir>] [--force] [--allow-private]');
  }
  assertValidSlug(name);
  return { source, name, out, force, allowPrivate };
}

function defaultRegistryDir(env = process.env) {
  if (env.ARTIFACTURE_DESIGN_DIR) return path.resolve(env.ARTIFACTURE_DESIGN_DIR);
  return path.join(os.homedir(), '.artifacture', 'design-systems');
}

function buildManifest({ name, source, modality, mapped, tokens }) {
  const produced = Object.keys(tokens);
  const missing = REQUIRED_VE_TOKENS.filter((token) => !produced.includes(token));
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  return {
    name,
    status: 'draft',
    description: `Draft design system learned from ${modality} source — review and refine before relying on it.`,
    source: {
      kind: modality,
      location: source,
      learnedAt: new Date().toISOString(),
      tool: `artifacture ve:learn ${pkg.version}`,
    },
    fonts: {
      imports: [],
      stacks: {
        display: mapped.core.fontDisplay,
        body: mapped.core.fontBody,
        mono: mapped.core.fontMono,
      },
      note: 'Add remote font imports here if the brand requires webfonts; stacks must end in a system fallback so artifacts degrade gracefully offline.',
    },
    notes: [
      'DRAFT: heuristically extracted. Refine per docs/design-systems.md (agent-assisted refinement flow), then remove the draft status.',
    ],
    extraction: {
      decisions: mapped.decisions,
      notes: mapped.notes,
      sizes: mapped.core.sizes,
      ease: mapped.core.ease,
      coverage: {
        produced: produced.length,
        required: REQUIRED_VE_TOKENS.length,
        missingRequired: missing,
      },
    },
  };
}

async function main() {
  const { source, name, out, force, allowPrivate } = parseArgs(process.argv.slice(2));
  const modality = detectModality(source);

  let extraction;
  if (modality === 'url') {
    extraction = await extractFromUrlSource(source, { allowPrivate });
  } else if (modality === 'image') {
    extraction = await extractFromImageSource(source);
  } else {
    extraction = extractFromCode(await fs.readFile(path.resolve(source), 'utf8'));
  }

  const mapped = mapExtractionToCore(extraction);
  const tokens = deriveTokens(mapped.core);
  const manifest = buildManifest({ name, source, modality, mapped, tokens });

  const registryDir = out ? path.resolve(out) : defaultRegistryDir();
  const systemDir = path.join(registryDir, name);
  try {
    await fs.access(systemDir);
    if (!force) {
      throw new Error(`Refusing to overwrite existing design system at ${systemDir} (pass --force to replace).`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(systemDir, { recursive: true });
  await fs.writeFile(path.join(systemDir, 'tokens.css'), tokensCssText(tokens, { name }));
  await fs.writeFile(path.join(systemDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Learned design system "${name}" (${modality}) → ${systemDir}`);
  console.log(`  tokens: ${Object.keys(tokens).length} produced, ${manifest.extraction.coverage.missingRequired.length} required missing`);
  for (const [slot, why] of Object.entries(mapped.decisions)) console.log(`  ${slot}: ${why}`);
  for (const note of mapped.notes) console.log(`  note: ${note}`);
  console.log('Draft written — refine tokens.css/manifest.json before shipping (docs/design-systems.md).');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
