import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const revision = "240a9bf7c50cc6226148762a1017466fcbc08523";
const upstream = `https://raw.githubusercontent.com/wheresryan22/anatomy/${revision}`;
const directory = fileURLToPath(new URL("../public/vendor/", import.meta.url));
const read = async (file) => {
  const response = await fetch(`${upstream}/${file}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Anatomy fetch failed: ${response.status} ${file}`);
  return response.text();
};
const [html, license] = await Promise.all([
  read("examples/dial-indicator/dial-indicator-light.html"),
  read("LICENSE"),
]);
// Only presentation overrides. The upstream geometry, interaction and physical model stay intact.
const style = `<style>
body.iso[data-theme="light"] { --anatomy-page:#fff; --anatomy-paper:#fff; --anatomy-card:#fff; --anatomy-lit:#e56a35; --anatomy-weight:.65px; }
.iso-page { max-width:none; padding:0; margin:0; }
.iso-plate { border:0; box-shadow:none; border-radius:0; padding:0; }
.iso-plate-corners,.iso-legend { display:none; }
.iso-stage { outline-offset:-3px; }
.iso-stage:focus-visible { outline:2px solid #e56a35; }
</style>`;
const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">`;
await mkdir(directory, { recursive: true });
await writeFile(
  path.join(directory, "anatomy-dial.html"),
  html
    .replace("<head>", `<head>${policy}`)
    .replace("</head>", `${style}</head>`) +
    `\n<!-- Upstream ${upstream}\n${license.replaceAll("--", "—")} -->\n`,
);
await writeFile(path.join(directory, "ANATOMY-LICENSE.txt"), license);
console.log(`Prepared native Anatomy dial from ${revision}`);
