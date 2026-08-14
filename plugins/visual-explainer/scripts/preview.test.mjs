import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyUniqueTextPatch,
  buildPublisherEnvironment,
  escapeHtmlText,
  extractPublishedFiles,
  formatReview,
  hashSource,
  injectBridge,
  rankPackageRunners,
  startPreviewServer,
} from "./preview.mjs";

test("developer preview keeps the persistent chrome focused on the core workflow", async () => {
  const shellPath = new URL("./preview-shell.html", import.meta.url);
  const shell = await readFile(shellPath, "utf8");

  assert.match(shell, /class="control-label">Preview<\/span>/);
  assert.match(shell, /id="publish-label">Publish<\/span>/);
  assert.match(shell, /id="copy-review-label">Copy notes<\/span>/);
  assert.match(shell, />Clear all notes<\/span>/);
  assert.doesNotMatch(shell, /VE:\/\/ Developer preview/);
  assert.doesNotMatch(shell, /mode-hint/);
  assert.doesNotMatch(shell, /Save review/);
  assert.doesNotMatch(shell, /Preview ready/);
});

test("developer preview mirrors the active artifact hash in its shareable URL", async () => {
  const shellScript = await readFile(new URL("./preview-shell.js", import.meta.url), "utf8");
  const bridgeScript = await readFile(new URL("./preview-bridge.js", import.meta.url), "utf8");

  assert.match(shellScript, /history\.replaceState\(history\.state/);
  assert.match(shellScript, /postToFrame\("set-location"/);
  assert.match(bridgeScript, /case "set-location"/);
  assert.match(bridgeScript, /for \(const method of \["pushState", "replaceState"\]\)/);
});

test("preview host and bridge keep their message protocol symmetric", async () => {
  const shellScript = await readFile(new URL("./preview-shell.js", import.meta.url), "utf8");
  const bridgeScript = await readFile(new URL("./preview-bridge.js", import.meta.url), "utf8");
  const hostCommands = [...shellScript.matchAll(/postToFrame\("([^"]+)"/g)].map((match) => match[1]);
  const bridgeCommands = [...bridgeScript.matchAll(/case "([^"]+)":/g)].map((match) => match[1]);
  const bridgeEvents = [...bridgeScript.matchAll(/post\("([^"]+)"/g)].map((match) => match[1]);
  const hostEvents = [...shellScript.matchAll(/case "([^"]+)":/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(hostCommands)].filter((type) => !bridgeCommands.includes(type)), []);
  assert.deepEqual([...new Set(bridgeEvents)].filter((type) => !hostEvents.includes(type)), []);
  assert.doesNotMatch(shellScript, /request-location/);
  assert.doesNotMatch(bridgeScript, /request-location/);
});

test("annotation targeting excludes the workspace behind a slide, not the slide itself", async () => {
  const bridgeScript = await readFile(new URL("./preview-bridge.js", import.meta.url), "utf8");

  assert.match(bridgeScript, /EXCLUDED_TARGET_SELECTOR = "html, body, main, \[data-ve-no-annotate-self\]"/);
  assert.doesNotMatch(bridgeScript, /EXCLUDED_TARGET_SELECTOR = "[^"]*canvas/);
  assert.match(bridgeScript, /target\.matches\?\.\(EXCLUDED_TARGET_SELECTOR\)/);
});

test("publisher environment includes user-local runtime bins ahead of inherited PATH", () => {
  const baseEnvironment = { PATH: "/usr/bin:/bin", SAMPLE: "kept" };
  const environment = buildPublisherEnvironment(baseEnvironment, "/Users/example");
  assert.equal(environment.SAMPLE, "kept");
  assert.equal(environment.NO_COLOR, "1");
  assert.equal(environment.PATH, "/Users/example/.bun/bin:/Users/example/.local/bin:/Users/example/Library/pnpm:/usr/bin:/bin");
  assert.equal(baseEnvironment.PATH, "/usr/bin:/bin");
});

test("package runners prefer declarations, then lockfiles, then available defaults", () => {
  assert.deepEqual(
    rankPackageRunners({ packageManager: "pnpm@10.0.0" }, ["package-lock.json"]),
    ["pnpm", "npm", "bun"],
  );
  assert.deepEqual(rankPackageRunners({}, ["bun.lock"]), ["bun", "npm", "pnpm"]);
  assert.deepEqual(rankPackageRunners({}, []), ["npm", "pnpm", "bun"]);
});

test("publisher output reports generated HTML destinations", () => {
  assert.deepEqual(
    extractPublishedFiles("deck/deck.html · 42 KB\npublished/deck.html · synchronized\nDone"),
    ["deck/deck.html", "published/deck.html"],
  );
});

test("injectBridge loads before artifact scripts without touching the saved source", () => {
  const result = injectBridge("<!doctype html><body><h1>Hello</h1></body>", "abc 123");
  assert.match(result, /<h1>Hello<\/h1><script src="\/__ve\/bridge\.js\?session=abc%20123"><\/script>\n<\/body>/);
  const withHead = injectBridge("<html><head><script>window.app = true<\/script></head></html>", "safe");
  assert.match(withHead, /<head><script src="\/__ve\/bridge\.js\?session=safe"><\/script>\n<script>window\.app/);
});

test("text patches require one exact source occurrence and escape replacement markup", () => {
  const result = applyUniqueTextPatch("<h1>Old title</h1>", "Old title", "New & <better> title");
  assert.equal(result.source, "<h1>New &amp; &lt;better&gt; title</h1>");
  assert.throws(
    () => applyUniqueTextPatch("<p>Same</p><p>Same</p>", "Same", "Different"),
    /more than one source string/,
  );
});

test("confirmed repeated patches update bundled JavaScript strings with safe escaping", () => {
  const source = 'children:"Old title",shortTitle:"Old title"';
  const result = applyUniqueTextPatch(source, "Old title", 'New "title" </script>', { replaceAll: true });
  assert.equal(result.replacements, 2);
  assert.equal(
    result.source,
    'children:"New \\"title\\" \\u003c/script\\u003e",shortTitle:"New \\"title\\" \\u003c/script\\u003e"',
  );
});

test("clicked text prefers visible content over matching navigation metadata", () => {
  const source = 'children:"Old title",shortTitle:"Old title"';
  const result = applyUniqueTextPatch(source, "Old title", "New title", {
    anchor: { selector: "main > h1", tagName: "h1" },
  });
  assert.equal(result.replacements, 1);
  assert.equal(result.source, 'children:"New title",shortTitle:"Old title"');
});

test("unresolved conflicts expose labeled choices and patch only the selected occurrence", () => {
  const source = 'label:"Same",shortTitle:"Same"';
  assert.throws(
    () => applyUniqueTextPatch(source, "Same", "Different", {
      anchor: { selector: "main > span", tagName: "span" },
    }),
    (error) => error.code === "ambiguous-text"
      && error.occurrences.length === 2
      && error.occurrences[0].label === "Navigation or metadata",
  );
  const result = applyUniqueTextPatch(source, "Same", "Different", { occurrence: 1 });
  assert.equal(result.source, 'label:"Same",shortTitle:"Different"');
});

test("formatReview prefers compact React source locations and omits bulky HTML context", () => {
  const result = formatReview([
    {
      number: 1,
      comment: "Make this title shorter.",
      anchor: {
        html: "<h1>Long title</h1>",
        label: "h1 “Long title”",
        point: { x: 0.5, y: 0.25 },
        selector: "main > h1",
        tagName: "h1",
        text: "Long title",
      },
      source: {
        status: "exact",
        targets: [{ column: 7, line: 42, path: "deck/slides/c0/c0-00.tsx" }],
      },
    },
  ], "/tmp/deck.html", { projectRoot: "/tmp/project" });
  assert.match(result, /Make this title shorter\./);
  assert.match(result, /`deck\/slides\/c0\/c0-00\.tsx`/);
  assert.match(result, /42:7 \[1\]/);
  assert.doesNotMatch(result, /Selector|Relative point|<h1>Long title<\/h1>/);
  assert.ok(result.length < 300);
});

test("server patches, undoes, reviews, and never writes the injected bridge to the artifact", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ve-preview-test-"));
  const filePath = join(directory, "deck.html");
  const original = "<!doctype html><html><body><h1>Original heading</h1></body></html>";
  await writeFile(filePath, original);
  const preview = await startPreviewServer({ filePath, openBrowser: false, port: 0 });
  context.after(async () => {
    await preview.close();
    await rm(directory, { recursive: true, force: true });
  });

  const meta = await fetch(`${preview.url}/__ve/meta`).then((response) => response.json());
  const artifact = await fetch(`${preview.url}${meta.artifactUrl}`).then((response) => response.text());
  assert.match(artifact, /\/__ve\/bridge\.js/);
  assert.doesNotMatch(await readFile(filePath, "utf8"), /\/__ve\/bridge\.js/);

  const patchResponse = await fetch(`${preview.url}/__ve/patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      after: "Edited heading",
      anchor: { selector: "h1" },
      artifactRevision: hashSource(original),
      before: "Original heading",
    }),
  });
  assert.equal(patchResponse.status, 200);
  assert.match(await readFile(filePath, "utf8"), /<h1>Edited heading<\/h1>/);

  const undoResponse = await fetch(`${preview.url}/__ve/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(undoResponse.status, 200);
  const undoResult = await undoResponse.json();
  assert.equal(undoResult.after, "Edited heading");
  assert.equal(undoResult.before, "Original heading");
  assert.equal(await readFile(filePath, "utf8"), original);

  const reviewResponse = await fetch(`${preview.url}/__ve/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      annotations: [{ number: 1, comment: "Tighten this.", anchor: { selector: "h1", tagName: "h1" } }],
    }),
  });
  assert.equal(reviewResponse.status, 200);
  assert.match((await reviewResponse.json()).markdown, /Tighten this\./);

  for (const endpoint of ["patch", "review"]) {
    const invalidResponse = await fetch(`${preview.url}/__ve/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    assert.equal(invalidResponse.status, 400);
  }
});

test("malformed nearest package manifest stops publisher detection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ve-malformed-package-test-"));
  const filePath = join(directory, "deck.html");
  await writeFile(filePath, "<!doctype html><h1>Deck</h1>");
  await writeFile(join(directory, "package.json"), "{ invalid json");
  try {
    await assert.rejects(
      startPreviewServer({ filePath, openBrowser: false, port: 0 }),
      /Invalid JSON in .*package\.json/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("React-owned previews edit TSX, rebuild HTML, publish, and undo through source", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "ve-react-preview-test-"));
  const filePath = join(directory, "deck.html");
  const sourcePath = join(directory, "source.tsx");
  const originalSource = 'export const view = <h1>Original heading</h1>; export const meta = { shortTitle: "Original heading" };\n';
  const originalHtml = "<!doctype html><html><body><h1>Original heading</h1></body></html>";
  await writeFile(filePath, originalHtml);
  await writeFile(sourcePath, originalSource);
  await writeFile(join(directory, "package.json"), JSON.stringify({
    private: true,
    scripts: { export: "node build.mjs" },
    type: "module",
  }));
  await writeFile(join(directory, "build.mjs"), [
    'import fs from "node:fs";',
    'const source = fs.readFileSync("source.tsx", "utf8");',
    'const title = source.match(/<h1>(.*?)<\\/h1>/s)?.[1];',
    'fs.writeFileSync("deck.html", `<!doctype html><html><body><h1>${title}</h1></body></html>`);',
    'console.log("deck.html · synchronized");',
  ].join("\n"));
  const preview = await startPreviewServer({ filePath, openBrowser: false, port: 0 });
  context.after(async () => {
    await preview.close();
    await rm(directory, { recursive: true, force: true });
  });

  const meta = await fetch(`${preview.url}/__ve/meta`).then((response) => response.json());
  assert.equal(meta.publisher.command, "npm run export");
  const patchResponse = await fetch(`${preview.url}/__ve/patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      after: "Edited heading",
      anchor: { selector: "h1", tagName: "h1" },
      before: "Original heading",
      artifactRevision: meta.artifactRevision,
    }),
  });
  assert.equal(patchResponse.status, 200);
  const patchResult = await patchResponse.json();
  assert.equal(patchResult.rebuilt, true);
  assert.deepEqual(patchResult.sourcePaths, ["source.tsx"]);
  assert.match(await readFile(sourcePath, "utf8"), /<h1>Edited heading<\/h1>/);
  assert.match(await readFile(sourcePath, "utf8"), /shortTitle: "Original heading"/);
  assert.match(await readFile(filePath, "utf8"), /<h1>Edited heading<\/h1>/);

  const undoResponse = await fetch(`${preview.url}/__ve/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(undoResponse.status, 200);
  assert.equal((await undoResponse.json()).rebuilt, true);
  assert.equal(await readFile(sourcePath, "utf8"), originalSource);
  assert.equal(await readFile(filePath, "utf8"), originalHtml);

  await writeFile(sourcePath, originalSource.replaceAll("Original heading", "Published heading"));
  const publishResponse = await fetch(`${preview.url}/__ve/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(publishResponse.status, 200);
  assert.deepEqual((await publishResponse.clone().json()).publishedFiles, ["deck.html"]);
  assert.match(await readFile(filePath, "utf8"), /<h1>Published heading<\/h1>/);

  const reviewResponse = await fetch(`${preview.url}/__ve/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      annotations: [{
        number: 1,
        comment: "Shorten this.",
        anchor: { html: "<h1>Published heading</h1>", selector: "h1", tagName: "h1", text: "Published heading" },
      }],
    }),
  });
  assert.equal(reviewResponse.status, 200);
  const review = await reviewResponse.json();
  assert.equal(review.resolved, 1);
  assert.match(review.markdown, /`source\.tsx`/);
  assert.match(review.markdown, /1:\d+ \[1\]/);
  assert.doesNotMatch(review.markdown, /<h1>Published heading<\/h1>/);
});

test("escapeHtmlText preserves plain copy while neutralizing markup", () => {
  assert.equal(escapeHtmlText("R&D <team>"), "R&amp;D &lt;team&gt;");
});
