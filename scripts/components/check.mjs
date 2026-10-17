#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { componentRegistry, publicBlockIds, resolveBlocks, validateRelativePath } from './registry.mjs';
import { readTestedVersions } from './copier.mjs';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const typePackages = { react: '@types/react', 'react-dom': '@types/react-dom', three: '@types/three' };
const packageName = reference => reference.startsWith('@') ? reference.split('/').slice(0, 2).join('/') : reference.split('/')[0];

function assertRequirements(id, kind, declared, derived) {
  const missing = [...derived].filter(name => !declared.has(name));
  const extra = [...declared].filter(name => !derived.has(name));
  if (missing.length || extra.length) {
    throw new Error(`Block ${id} ${kind} disagree with selected source imports.${missing.length ? ` Missing: ${missing.join(', ')}.` : ''}${extra.length ? ` Unused: ${extra.join(', ')}.` : ''}`);
  }
}

async function checkDiscovery(id, files) {
  const block = componentRegistry[id];
  for (const entry of block.entryPoints) {
    const file = files.find(file => file.destination === entry.module || ['.ts', '.tsx', '.mjs'].some(extension => file.destination === `${entry.module}${extension}`));
    if (!file) throw new Error(`Block ${id} indexes an uncopied module: ${entry.module}.`);
    // A plain JavaScript leaf keeps its types in a copied sibling declaration file.
    const typesFile = file.destination.endsWith('.mjs') ? files.find(other => other.destination === file.destination.replace(/\.mjs$/, '.d.mts')) : undefined;
    const exported = new Set();
    for (const source of [file, typesFile].filter(Boolean)) {
      const code = await fs.readFile(path.resolve(packageRoot, source.source), 'utf8');
      const ast = ts.createSourceFile(source.source, code, ts.ScriptTarget.Latest, true);
      for (const statement of ast.statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) exported.add(element.name.text);
        } else if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
          if (statement.name && ts.isIdentifier(statement.name)) exported.add(statement.name.text);
          if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              if (ts.isIdentifier(declaration.name)) exported.add(declaration.name.text);
            }
          }
        }
      }
    }
    const missing = [...entry.exports, ...(entry.types ?? [])].filter(name => !exported.has(name));
    if (missing.length) throw new Error(`Block ${id} indexes missing exports from ${entry.module}: ${missing.join(', ')}.`);
  }
  for (const example of block.examples) {
    validateRelativePath(example, 'Component example');
    if (!(await fs.stat(path.resolve(packageRoot, example))).isFile()) throw new Error(`Block ${id} example is not a file: ${example}.`);
  }
}

/** Release guard over the explicit catalog, without copying or rewriting source. */
export async function checkComponentRegistry() {
  for (const id of publicBlockIds) {
    const selection = resolveBlocks([id]);
    await checkDiscovery(id, selection.files);
    const sources = new Set(selection.files.map(file => path.resolve(packageRoot, file.source)));
    const dependencies = new Set();
    const devDependencies = new Set();
    for (const source of sources) {
      const code = await fs.readFile(source, 'utf8');
      const imports = /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/.test(source) ? ts.preProcessFile(code, true, true) : null;
      const references = imports ? [
        ...imports.importedFiles.map(reference => ({ name: reference.fileName, typeDirective: false })),
        ...imports.typeReferenceDirectives.map(reference => ({ name: reference.fileName, typeDirective: true })),
      ] : [...code.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map(match => ({ name: match[1], typeDirective: false }));
      for (const { name: reference, typeDirective } of references) {
        if (/^(?:https?:|data:)/.test(reference)) continue;
        if (!reference.startsWith('.')) {
          const name = packageName(reference);
          if (typeDirective) devDependencies.add(name);
          else dependencies.add(name);
          continue;
        }
        const base = path.resolve(path.dirname(source), reference.split('?')[0]);
        const candidates = [base, ...['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.css'].map(extension => `${base}${extension}`)];
        if (!candidates.some(candidate => sources.has(candidate))) {
          throw new Error(`Block ${id} omits local import ${reference} from ${path.relative(packageRoot, source)}.`);
        }
      }
      if (source.endsWith('.mjs')) {
        const declaration = source.slice(0, -4) + '.d.mts';
        if (!sources.has(declaration)) throw new Error(`Block ${id} omits declaration ${path.relative(packageRoot, declaration)}.`);
      }
    }
    // These React packages expose their TypeScript declarations through @types.
    for (const name of dependencies) if (Object.hasOwn(typePackages, name)) devDependencies.add(typePackages[name]);
    assertRequirements(id, 'dependencies', new Set(selection.dependencies), dependencies);
    assertRequirements(id, 'devDependencies', new Set(selection.devDependencies), devDependencies);
    await readTestedVersions([...dependencies, ...devDependencies]);
  }
  return publicBlockIds.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await checkComponentRegistry();
  console.log(`Component APIs, examples, sources, package requirements, and declarations agree for ${count} blocks.`);
}
