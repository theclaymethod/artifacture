import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const presets = ['hairline', '3b1b', 'mono-color', 'algebrica'];

// Read the destination's existing tokens; native engines do not own another palette.
export async function nativeTheme(root, name) {
  if (!presets.includes(name)) throw new Error(`Unsupported native theme: ${name}.`);
  const css = await readFile(path.join(root, 'visual-explainer-mdx/themes.css'), 'utf8');
  const declarations = {};
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const base = selector.includes(':root') && !selector.includes('data-ve-preset="');
    const selected = selector.includes(`[data-ve-preset="${name}"]`) && !selector.includes(':is(') && !selector.includes('data-ve-appearance');
    if (!base && !selected) continue;
    for (const declaration of match[2].matchAll(/(--ve-[\w-]+)\s*:\s*([^;]+);/g)) declarations[declaration[1]] = declaration[2].trim();
  }
  function token(key, seen = new Set()) {
    if (seen.has(key) || !declarations[key]) throw new Error(`Cannot resolve native theme token ${key}.`);
    seen.add(key);
    const value = declarations[key];
    const reference = /^var\((--ve-[\w-]+)\)$/.exec(value);
    return reference ? token(reference[1], seen) : value;
  }
  function color(key) {
    const value = token(key);
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Native theme ${name} requires an opaque hex color for ${key}.`);
    return value;
  }
  const displayFont = /^"([^"]+)"/.exec(token('--ve-font-display'))?.[1];
  if (!['Inter', 'EB Garamond'].includes(displayFont)) throw new Error('Native theme requires a bundled display font.');
  return Object.freeze({ name, displayFont, background: color('--ve-bg'), surface: color('--ve-bg'), text: color('--ve-text'), muted: color('--ve-muted'), ink: color('--ve-illustration-ink'), detail: color('--ve-illustration-muted'), accent: color('--ve-accent'), stroke: Number(token('--ve-illustration-stroke')), detailStroke: Number(token('--ve-illustration-detail-stroke')), tokensSha256: createHash('sha256').update(css).digest('hex') });
}

// A bounded paint-only bridge over the pinned MIT renderer. No geometry or clocks change.
export async function bridgePsychopompThemes(source, themes) {
  const file = path.join(source, 'crates/psychopomp-render/src/render/theme.rs');
  const backup = path.join(source, '.artifacture/theme-original.rs');
  await mkdir(path.dirname(backup), { recursive: true });
  const original = await readFile(backup, 'utf8').catch(async error => {
    if (error.code !== 'ENOENT') throw error;
    const value = await readFile(file, 'utf8');
    await writeFile(backup, value, { flag: 'wx' });
    return value;
  });
  const variants = ['Hairline', 'ThreeBOneB', 'MonoColor', 'Algebrica'];
  const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const changes = [
    ['    Neutral,\n}', `    Neutral,\n    // Artifacture themes v1; paint-only adapter.\n    Hairline,\n    #[serde(rename = "3b1b")]\n    ThreeBOneB,\n    MonoColor,\n    Algebrica,\n}`],
    ['pub const ALL: [Self; 6]', 'pub const ALL: [Self; 10]'],
    ['        Self::Neutral,\n    ];', '        Self::Neutral,\n        Self::Hairline, Self::ThreeBOneB, Self::MonoColor, Self::Algebrica,\n    ];'],
    ['            Self::Neutral => "Clear Neutral",', '            Self::Neutral => "Clear Neutral",\n            Self::Hairline => "Hairline", Self::ThreeBOneB => "3b1b",\n            Self::MonoColor => "Mono Color", Self::Algebrica => "Algebrica",'],
    ['            "neutral" => Ok(Self::Neutral),', '            "neutral" => Ok(Self::Neutral),\n            "hairline" => Ok(Self::Hairline), "3b1b" => Ok(Self::ThreeBOneB),\n            "mono-color" => Ok(Self::MonoColor), "algebrica" => Ok(Self::Algebrica),'],
    ['        match self {\n            Self::Original => Palette {', `        match self {\n${themes.map((theme, index) => `            Self::${variants[index]} => Palette {\n                background: ${JSON.stringify(rgb(theme.background))}, surface: ${JSON.stringify(rgb(theme.surface))},\n                raised: ${JSON.stringify(rgb(theme.detail))}, text: ${JSON.stringify(rgb(theme.text))}, muted: ${JSON.stringify(rgb(theme.ink))},\n                accent: ${JSON.stringify(rgb(theme.accent))}, keyword: ${JSON.stringify(rgb(theme.text))},\n                types: ${JSON.stringify(rgb(theme.text))}, string: ${JSON.stringify(rgb(theme.text))},\n            },`).join('\n')}\n            Self::Original => Palette {`],
    ['        if self == Self::Neutral {', '        if matches!(self, Self::Hairline | Self::ThreeBOneB | Self::MonoColor | Self::Algebrica) {\n            return match tone {\n                Tone::Plain => palette.text, Tone::Muted => palette.muted,\n                _ => palette.accent,\n            };\n        }\n        if self == Self::Neutral {'],
  ];
  let patched = original;
  for (const [before, after] of changes) {
    if (patched.split(before).length !== 2) throw new Error('Pinned Psychopomp theme bridge no longer matches its source anchor.');
    patched = patched.replace(before, after);
  }
  await writeFile(file, patched);
  return createHash('sha256').update(patched).digest('hex');
}
