import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export async function buildGallery(runDir) {
  const summaryPath = path.join(runDir, 'summary.json');
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const models = Object.keys(summary.matrix).sort();
  const tasks = Array.from(new Set(summary.cells.map((cell) => cell.task))).sort();
  const cellsByKey = new Map(summary.cells.map((cell) => [`${cell.model}/${cell.task}`, cell]));
  const rows = [];

  for (const task of tasks) {
    const cols = [];
    for (const model of models) {
      const cell = cellsByKey.get(`${model}/${task}`);
      cols.push(await renderCell(runDir, cell));
    }
    rows.push(`<tr><th scope="row">${escapeHtml(task)}</th>${cols.join('')}</tr>`);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Model Matrix Gallery ${escapeHtml(path.basename(runDir))}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f7f7f5; overflow-x: auto; }
  main { padding: 24px; min-width: 980px; }
  h1 { margin: 0 0 16px; font-size: 24px; line-height: 1.15; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; border: 1px solid #d8d8d2; }
  th, td { border: 1px solid #d8d8d2; vertical-align: top; padding: 10px; }
  thead th { background: #eeeeea; font-size: 13px; text-align: left; }
  tbody th { width: 140px; background: #f3f3ef; text-align: left; font-size: 13px; }
  .cell { display: grid; gap: 8px; }
  .meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; font-size: 12px; }
  .badge { display: inline-flex; min-width: 44px; justify-content: center; border-radius: 999px; padding: 2px 8px; color: #fff; background: #28745c; font-weight: 700; }
  .badge.warn { background: #9a5b13; }
  .badge.bad { background: #983737; }
  .badge.acuity { background: #2f5f9f; }
  .badge.acuity.missing { background: #74746f; }
  .count { color: #454541; }
  img { display: block; max-width: 100%; border: 1px solid #c8c8c2; background: #fff; }
  details { display: grid; gap: 8px; }
  summary { cursor: pointer; font-size: 12px; color: #343430; }
  .missing { min-height: 160px; display: grid; place-items: center; color: #62625c; background: #f0f0ec; border: 1px dashed #b8b8b0; font-size: 12px; text-align: center; padding: 16px; }
</style>
</head>
<body>
<main>
  <h1>Model Matrix Gallery ${escapeHtml(path.basename(runDir))}</h1>
  <table>
    <thead><tr><th scope="col">Task</th>${models.map((model) => `<th scope="col">${escapeHtml(model)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</main>
</body>
</html>
`;
  const outPath = path.join(runDir, 'gallery.html');
  await fs.writeFile(outPath, html);
  return outPath;
}

async function renderCell(runDir, cell) {
  if (!cell) return '<td><div class="missing">No cell</div></td>';
  const cellDir = path.join(runDir, cell.model, cell.task);
  const report = await readJson(path.join(cellDir, 'report.json'));
  const screenshots = report?.screenshots || [];
  const mobile = pickScreenshot(screenshots, /390x844-light\.png$/) || pickScreenshot(screenshots, /390x844.*\.png$/);
  const desktop = pickScreenshot(screenshots, /1440x900-light\.png$/) || pickScreenshot(screenshots, /1440x900.*\.png$/);
  const mobileImg = mobile ? await imgTag(mobile, '390 light screenshot') : '<div class="missing">No 390 light screenshot</div>';
  const desktopImg = desktop ? await imgTag(desktop, 'desktop screenshot') : '<div class="missing">No desktop screenshot</div>';
  const score = Number.isFinite(cell.score_after_repair) ? cell.score_after_repair : cell.score;
  const badgeClass = score >= 85 ? '' : score >= 60 ? ' warn' : ' bad';
  const acuity = Number.isFinite(cell.acuity_score) ? Number(cell.acuity_score).toFixed(1) : null;
  return `<td><div class="cell">
    <div class="meta"><span class="badge${badgeClass}">${Number(score).toFixed(0)}</span><span class="badge acuity${acuity == null ? ' missing' : ''}">${acuity == null ? 'Acuity -' : `Acuity ${acuity}`}</span><span class="count">${cell.verify_errors} errors</span><span class="count">${cell.verify_warns} warns</span></div>
    ${mobileImg}
    <details><summary>Desktop</summary>${desktopImg}</details>
  </div></td>`;
}

function pickScreenshot(screenshots, pattern) {
  return screenshots.find((shot) => pattern.test(path.basename(shot)));
}

async function imgTag(filePath, alt) {
  const bytes = await fs.readFile(filePath);
  return `<img alt="${escapeHtml(alt)}" src="data:image/png;base64,${bytes.toString('base64')}">`;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node evals/model-matrix/gallery.mjs <out/run-id>');
    process.exit(2);
  }
  console.log(await buildGallery(path.resolve(process.cwd(), runDir)));
}
