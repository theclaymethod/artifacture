#!/usr/bin/env node
// Asserts that every version source in the repo agrees, and that the
// marketplace entry's repository field points at the real repo. Plain
// Node ESM, no dependencies, so it can run before `npm ci` if needed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const EXPECTED_REPOSITORY = 'https://github.com/theclaymethod/artifacture';

function readJson(relPath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

function readSkillFrontmatterVersion(relPath) {
  const text = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) throw new Error(`No frontmatter found in ${relPath}`);
  const versionMatch = frontmatterMatch[1].match(/^\s*version:\s*["']?([^"'\n]+?)["']?\s*$/m);
  if (!versionMatch) throw new Error(`No version field in frontmatter of ${relPath}`);
  return versionMatch[1].trim();
}

const pkg = readJson('package.json');
const pluginManifest = readJson('plugins/visual-explainer/.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const marketplaceEntry = marketplace.plugins.find((plugin) => plugin.name === 'visual-explainer');

const sources = [
  { label: 'package.json', path: 'package.json', value: pkg.version },
  { label: 'plugin.json', path: 'plugins/visual-explainer/.claude-plugin/plugin.json', value: pluginManifest.version },
  { label: 'marketplace.json', path: '.claude-plugin/marketplace.json', value: marketplaceEntry?.version },
  {
    label: 'SKILL.md frontmatter',
    path: 'plugins/visual-explainer/SKILL.md',
    value: readSkillFrontmatterVersion('plugins/visual-explainer/SKILL.md'),
  },
];

const repository = marketplaceEntry?.repository;
const uniqueVersions = new Set(sources.map((source) => source.value));
const versionsOk = uniqueVersions.size === 1;
const repositoryOk = repository === EXPECTED_REPOSITORY;

function printTable() {
  const rows = [
    ...sources.map((source) => [source.label, source.path, String(source.value)]),
    ['repository', '.claude-plugin/marketplace.json', String(repository)],
  ];
  const widths = [0, 1, 2].map((col) => Math.max(...rows.map((row) => row[col].length)));
  for (const row of rows) {
    console.error(row.map((cell, index) => cell.padEnd(widths[index])).join('  '));
  }
}

if (!versionsOk || !repositoryOk) {
  console.error('Manifest consistency check FAILED\n');
  printTable();
  console.error('');
  if (!versionsOk) console.error(`Version mismatch across sources: ${[...uniqueVersions].join(', ')}`);
  if (!repositoryOk) console.error(`Repository mismatch: expected "${EXPECTED_REPOSITORY}", got "${repository}"`);
  process.exit(1);
}

console.log('Manifest consistency check passed.\n');
printTable();
process.exit(0);
