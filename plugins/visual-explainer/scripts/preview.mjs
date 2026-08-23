#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { watch } from "node:fs";
import {
  access,
  chmod,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 1_000_000;
const PREVIEW_SESSION_COOKIE = "__ve_preview_session";
const ANSI_STYLE_PATTERN = new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`, "g");
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mdx", ".ts", ".tsx"]);
const SOURCE_IGNORED_DIRECTORIES = new Set([".git", ".next", "build", "dist", "node_modules", "published"]);
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export function hashSource(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function buildPublisherEnvironment(baseEnvironment = process.env, homeDirectory = homedir()) {
  const inheritedPath = baseEnvironment.PATH || baseEnvironment.Path || baseEnvironment.path || "";
  const executablePaths = [
    join(homeDirectory, ".bun", "bin"),
    join(homeDirectory, ".local", "bin"),
    baseEnvironment.PNPM_HOME,
    join(homeDirectory, "Library", "pnpm"),
    inheritedPath,
  ].filter(Boolean);
  return {
    ...baseEnvironment,
    NO_COLOR: "1",
    PATH: executablePaths.join(delimiter),
  };
}

export function rankPackageRunners(packageJson = {}, lockFiles = []) {
  const declared = String(packageJson.packageManager || "").match(/^(npm|pnpm|bun)@/)?.[1];
  const lockPreferences = [];
  if (lockFiles.includes("pnpm-lock.yaml")) lockPreferences.push("pnpm");
  if (lockFiles.includes("bun.lock") || lockFiles.includes("bun.lockb")) lockPreferences.push("bun");
  if (lockFiles.includes("package-lock.json")) lockPreferences.push("npm");
  return [...new Set([declared, ...lockPreferences, "npm", "pnpm", "bun"].filter(Boolean))];
}

export function escapeHtmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function extractPublishedFiles(output) {
  const files = [];
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = line.trim().match(/^(.+?\.html)(?:\s+·|\s*$)/i);
    if (match && !files.includes(match[1])) files.push(match[1]);
  }
  return files;
}

export function injectBridge(source, session) {
  const bridge = `<script src="/__ve/bridge.js?session=${encodeURIComponent(session)}"></script>`;
  const headOpen = /<head(?:\s[^>]*)?>/i.exec(source);
  if (headOpen?.index !== undefined) {
    const insertAt = headOpen.index + headOpen[0].length;
    return `${source.slice(0, insertAt)}${bridge}\n${source.slice(insertAt)}`;
  }
  const bodyClose = source.search(/<\/body\s*>/i);
  if (bodyClose === -1) return `${source}\n${bridge}\n`;
  return `${source.slice(0, bodyClose)}${bridge}\n${source.slice(bodyClose)}`;
}

export function applyUniqueTextPatch(source, before, after, {
  anchor,
  occurrence,
  replaceAll = false,
} = {}) {
  if (!isString(before) || before.length === 0) {
    throw createHttpError(400, "The original text is empty.");
  }
  if (!isString(after)) {
    throw createHttpError(400, "The replacement text is invalid.");
  }

  const indices = findOccurrences(source, before);
  if (indices.length === 0) {
    throw createHttpError(
      409,
      "That rendered text does not map exactly to the HTML source. Add it as a comment or open the source instead.",
    );
  }
  const describedOccurrences = describeOccurrences(source, before, indices);
  let replacementIndices;
  if (replaceAll) {
    replacementIndices = indices;
  } else if (Number.isInteger(occurrence)) {
    if (occurrence < 0 || occurrence >= indices.length) {
      throw createHttpError(400, "The selected source occurrence is no longer available.");
    }
    replacementIndices = [indices[occurrence]];
  } else if (indices.length === 1) {
    replacementIndices = [indices[0]];
  } else {
    const preferred = anchor?.selector
      ? describedOccurrences.filter((item) => item.role === "content")
      : [];
    if (preferred.length === 1) {
      replacementIndices = [indices[preferred[0].occurrence]];
    } else {
      throw createHttpError(
        409,
        "This text maps to more than one source string. Choose the occurrence that belongs to the element you clicked.",
        { code: "ambiguous-text", occurrences: describedOccurrences },
      );
    }
  }
  let nextSource = source;
  for (const index of [...replacementIndices].reverse()) {
    const encodedAfter = encodeReplacementForContext(source, index, before.length, after);
    nextSource = `${nextSource.slice(0, index)}${encodedAfter}${nextSource.slice(index + before.length)}`;
  }
  return {
    replacements: replacementIndices.length,
    source: nextSource,
  };
}

export function formatReview(annotations, filePath, { projectRoot } = {}) {
  const safeAnnotations = Array.isArray(annotations) ? annotations : [];
  const lines = [
    "Address these visual review notes. Edit source files, not generated HTML.",
    "",
    projectRoot ? `Source root: \`${projectRoot}\`` : `Artifact: \`${filePath}\``,
    "",
  ];

  if (safeAnnotations.length === 0) {
    lines.push("No annotations.", "");
    return lines.join("\n");
  }

  const exactGroups = new Map();
  const fallbacks = [];
  for (const [index, annotation] of safeAnnotations.entries()) {
    const anchor = annotation?.anchor ?? {};
    const number = Number.isInteger(annotation?.number) ? annotation.number : index + 1;
    const source = annotation?.source;
    const quote = cleanInline(anchor.ownText || anchor.text || "").slice(0, 100);
    const element = cleanInline(anchor.tagName || anchor.label || "element");
    const description = [element ? `<${element}>` : "", quote ? `“${quote}”` : ""].filter(Boolean).join(" ");
    const comment = cleanBlock(annotation?.comment || "").replace(/\n+/g, " / ");
    if (source?.status === "exact" && source.targets?.[0]) {
      const target = source.targets[0];
      if (!exactGroups.has(target.path)) exactGroups.set(target.path, []);
      exactGroups.get(target.path).push({ comment, description, number, target });
    } else if (source?.status === "ambiguous" && source.targets?.length) {
      const target = `candidates ${source.targets.slice(0, 4).map((item) => `\`${formatSourceTarget(item)}\``).join(", ")}`;
      fallbacks.push(`${number}. ${target}${description ? ` — ${description}` : ""} — ${comment}`);
    } else {
      const selector = cleanInline(anchor.selector || "unresolved").slice(0, 240);
      const location = cleanInline(anchor.location || "").slice(0, 160);
      const target = `DOM \`${selector}\`${location ? ` at \`${location}\`` : ""}`;
      fallbacks.push(`${number}. ${target}${description ? ` — ${description}` : ""} — ${comment}`);
    }
  }

  for (const [path, annotationsForPath] of exactGroups) {
    lines.push(`\`${cleanInline(path)}\``);
    for (const item of annotationsForPath) {
      lines.push(`- ${item.target.line}:${item.target.column} [${item.number}]${item.description ? ` — ${item.description}` : ""} — ${item.comment}`);
    }
    lines.push("");
  }
  if (fallbacks.length) lines.push("Fallback targets", ...fallbacks.map((item) => `- ${item}`), "");

  return lines.join("\n");
}

export async function startPreviewServer({ filePath, port = 0, openBrowser = true } = {}) {
  if (!filePath) throw new Error("Provide an HTML file to preview.");
  const targetPath = resolve(filePath);
  if (extname(targetPath).toLowerCase() !== ".html") {
    throw new Error(`Expected an .html file, received: ${targetPath}`);
  }
  await access(targetPath);

  const targetDirectory = dirname(targetPath);
  const targetName = targetPath.slice(targetDirectory.length + 1);
  const publisher = await detectPublisher(targetPath);
  const session = randomBytes(18).toString("base64url");
  const clients = new Set();
  const editHistory = [];
  let lastHash = hashSource(await readFile(targetPath, "utf8"));
  let mutationQueue = Promise.resolve();
  let pendingMutations = 0;
  let watchTimer;

  async function withMutationGuard(operation) {
    pendingMutations += 1;
    const previous = mutationQueue;
    let release;
    mutationQueue = new Promise((resolvePromise) => { release = resolvePromise; });
    await previous;
    try {
      return await operation();
    } finally {
      pendingMutations -= 1;
      release();
    }
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      setSecurityHeaders(response);

      if (request.method === "GET" && url.pathname === "/") {
        setPreviewSessionCookie(response, session);
        return sendFile(response, join(SCRIPT_DIR, "preview-shell.html"));
      }
      if (request.method === "GET" && url.pathname === "/__ve/shell.css") {
        return sendFile(response, join(SCRIPT_DIR, "preview-shell.css"));
      }
      if (request.method === "GET" && url.pathname === "/__ve/shell.js") {
        return sendFile(response, join(SCRIPT_DIR, "preview-shell.js"));
      }
      if (request.method === "GET" && url.pathname === "/__ve/annotations.js") {
        return sendFile(response, join(SCRIPT_DIR, "preview-annotations.mjs"));
      }
      if (request.method === "GET" && url.pathname === "/__ve/bridge.js") {
        if (url.searchParams.get("session") !== session) {
          throw createHttpError(403, "Invalid preview session.");
        }
        return sendFile(response, join(SCRIPT_DIR, "preview-bridge.js"));
      }
      if (request.method === "GET" && url.pathname === "/__ve/meta") {
        setPreviewSessionCookie(response, session);
        const source = await readFile(targetPath, "utf8");
        lastHash = hashSource(source);
        return sendJson(response, 200, {
          artifactRevision: lastHash,
          artifactUrl: `/file/${encodeURIComponent(targetName)}`,
          canUndo: editHistory.length > 0,
          fileName: targetName,
          filePath: targetPath,
          publisher: publisher
            ? { command: publisherCommand(publisher), projectRoot: publisher.cwd }
            : null,
          session,
        });
      }
      if (request.method === "GET" && url.pathname === "/__ve/events") {
        response.writeHead(200, {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "Content-Type": "text/event-stream",
        });
        response.write(": connected\n\n");
        clients.add(response);
        request.on("close", () => clients.delete(response));
        return;
      }
      if (request.method === "POST" && url.pathname.startsWith("/__ve/")) {
        validatePreviewPost(request, session);
      }
      if (request.method === "POST" && url.pathname === "/__ve/patch") {
        const body = parsePatchRequest(await readJsonBody(request));
        return await withMutationGuard(async () => {
          const targetSource = await readFile(targetPath, "utf8");
          const currentHash = hashSource(targetSource);
          if (body.artifactRevision !== currentHash) {
            throw createHttpError(
              409,
              "The HTML changed after editing began. Reload the preview and try again.",
            );
          }

          let nextHash;
          let sourcePaths = [];
          if (publisher) {
            const occurrences = await findProjectSourceOccurrences(publisher.cwd, body.before);
            const selected = selectProjectSourceOccurrences(occurrences, body.anchor, {
              occurrence: body.occurrence,
              replaceAll: body.replaceAll === true,
            });
            const changes = buildProjectSourceChanges(selected, body.before, body.after);
            await writeDocumentsTransaction(changes, "afterDocument", "beforeDocument");
            try {
              await runPublisher(publisher);
              const builtSource = await readFile(targetPath, "utf8");
              nextHash = hashSource(builtSource);
            } catch (error) {
              await restoreAfterFailure(error, [
                ...changes.map((change) => ({ contents: change.beforeDocument, path: change.path })),
                { contents: targetSource, path: targetPath },
              ]);
              throw error;
            }
            sourcePaths = changes.map((change) => relative(publisher.cwd, change.path));
            editHistory.push({
              afterHash: nextHash,
              afterText: body.after,
              beforeText: body.before,
              kind: "react-source",
              sourceChanges: changes.map(({ afterDocument, afterHash, beforeDocument, path }) => ({
                afterDocument,
                afterHash,
                beforeDocument,
                path,
              })),
            });
          } else {
            const patch = applyUniqueTextPatch(targetSource, body.before, body.after, {
              anchor: body.anchor,
              occurrence: body.occurrence,
              replaceAll: body.replaceAll === true,
            });
            await atomicWrite(targetPath, patch.source);
            nextHash = hashSource(patch.source);
            editHistory.push({
              afterHash: nextHash,
              afterText: body.after,
              beforeDocument: targetSource,
              beforeText: body.before,
              kind: "generated-html",
            });
          }
          if (editHistory.length > 20) editHistory.shift();
          lastHash = nextHash;
          broadcast(clients, "artifact-changed", { artifactRevision: nextHash, reason: publisher ? "source-edit" : "text-edit" });
          return sendJson(response, 200, {
            artifactRevision: nextHash,
            canUndo: true,
            rebuilt: Boolean(publisher),
            sourcePaths,
          });
        });
      }
      if (request.method === "POST" && url.pathname === "/__ve/undo") {
        return await withMutationGuard(async () => {
          const latest = editHistory.at(-1);
          if (!latest) throw createHttpError(409, "There is no preview edit to undo.");
          const source = await readFile(targetPath, "utf8");
          const currentHash = hashSource(source);
          if (currentHash !== latest.afterHash) {
            throw createHttpError(
              409,
              "The HTML changed after the last preview edit, so undo was stopped to avoid overwriting newer work.",
            );
          }
          if (latest.kind === "react-source") {
            for (const change of latest.sourceChanges) {
              const currentSource = await readFile(change.path, "utf8");
              if (hashSource(currentSource) !== change.afterHash) {
                throw createHttpError(
                  409,
                  `The React source changed after this preview edit (${relative(publisher.cwd, change.path)}), so undo was stopped.`,
                );
              }
            }
            await writeDocumentsTransaction(latest.sourceChanges, "beforeDocument", "afterDocument");
            try {
              await runPublisher(publisher);
            } catch (error) {
              await restoreAfterFailure(error, [
                ...latest.sourceChanges.map((change) => ({ contents: change.afterDocument, path: change.path })),
                { contents: source, path: targetPath },
              ]);
              throw createHttpError(422, `Rebuilding after undo failed, so the React edit was kept: ${error.message}`);
            }
          } else {
            await atomicWrite(targetPath, latest.beforeDocument);
          }
          editHistory.pop();
          lastHash = hashSource(await readFile(targetPath, "utf8"));
          broadcast(clients, "artifact-changed", { artifactRevision: lastHash, reason: "undo" });
          return sendJson(response, 200, {
            after: latest.afterText,
            artifactRevision: lastHash,
            before: latest.beforeText,
            canUndo: editHistory.length > 0,
            rebuilt: latest.kind === "react-source",
          });
        });
      }
      if (request.method === "POST" && url.pathname === "/__ve/review") {
        const body = parseAnnotationRequest(await readJsonBody(request));
        const annotations = await resolveReviewAnnotations(body.annotations, publisher);
        const markdown = formatReview(annotations, targetPath, { projectRoot: publisher?.cwd });
        const resolved = annotations.filter((annotation) => annotation.source?.status && annotation.source.status !== "unresolved").length;
        return sendJson(response, 200, { markdown, resolved });
      }
      if (request.method === "POST" && url.pathname === "/__ve/publish") {
        return await withMutationGuard(async () => {
          if (!publisher) {
            throw createHttpError(409, "No publish, export, or build script was found in an owning package.json.");
          }
          const startedAt = Date.now();
          const beforePublish = await readFile(targetPath, "utf8");
          let output;
          try {
            output = await runPublisher(publisher);
          } catch (error) {
            await restoreAfterFailure(error, [{ contents: beforePublish, path: targetPath }]);
            throw error;
          }
          const source = await readFile(targetPath, "utf8");
          lastHash = hashSource(source);
          broadcast(clients, "artifact-changed", { artifactRevision: lastHash, reason: "publish" });
          return sendJson(response, 200, {
            artifactRevision: lastHash,
            durationMs: Date.now() - startedAt,
            outputPath: targetPath,
            publishedFiles: extractPublishedFiles(output),
          });
        });
      }
      if (request.method === "GET" && url.pathname.startsWith("/file/")) {
        const relativePath = decodeURIComponent(url.pathname.slice("/file/".length));
        const assetPath = safeResolve(targetDirectory, relativePath);
        if (assetPath === targetPath) {
          const source = await readFile(targetPath, "utf8");
          response.writeHead(200, {
            "Cache-Control": "no-store",
            "Content-Type": "text/html; charset=utf-8",
          });
          response.end(injectBridge(source, session));
          return;
        }
        return sendFile(response, assetPath);
      }

      throw createHttpError(404, "Not found.");
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      const message = statusCode === 500 ? "The preview server hit an unexpected error." : error.message;
      if (!response.headersSent) {
        sendJson(response, statusCode, {
          code: error?.code,
          error: message,
          occurrences: error?.occurrences,
        });
      }
      else response.end();
      if (statusCode === 500) console.error(error);
    }
  });

  const watcher = watch(targetDirectory, { persistent: false }, (_eventType, changedName) => {
    if (changedName && changedName.toString() !== targetName) return;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(async () => {
      try {
        if (pendingMutations > 0) return;
        const nextHash = hashSource(await readFile(targetPath, "utf8"));
        if (nextHash === lastHash) return;
        lastHash = nextHash;
        broadcast(clients, "artifact-changed", { artifactRevision: nextHash, reason: "external-change" });
      } catch (error) {
        if (error?.code === "ENOENT") broadcast(clients, "artifact-missing", {});
        else {
          console.error("Preview watcher failed:", error);
          broadcast(clients, "artifact-error", {});
        }
      }
    }, 90);
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, "127.0.0.1", resolvePromise);
  });

  const address = server.address();
  const actualPort = parseListeningPort(address, port);
  const url = `http://127.0.0.1:${actualPort}`;
  if (openBrowser) openUrl(url);

  return {
    close: async () => {
      watcher.close();
      clearTimeout(watchTimer);
      for (const client of clients) client.end();
      await new Promise((resolvePromise) => server.close(resolvePromise));
    },
    filePath: targetPath,
    server,
    url,
  };
}

function createHttpError(statusCode, message, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, details);
  return error;
}

function findOccurrences(source, value) {
  const indices = [];
  let offset = 0;
  while (offset <= source.length) {
    const index = source.indexOf(value, offset);
    if (index === -1) break;
    indices.push(index);
    offset = index + Math.max(value.length, 1);
  }
  return indices;
}

async function detectPublisher(targetPath) {
  let current = dirname(targetPath);
  while (true) {
    const packagePath = join(current, "package.json");
    try {
      const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
      const script = ["publish", "export", "build"].find((name) => isString(packageJson?.scripts?.[name]));
      if (script) {
        const runner = await selectPackageRunner(current, packageJson);
        return { cwd: current, runner, script };
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        // Missing manifests are expected while walking toward the filesystem root.
      } else if (error instanceof SyntaxError) {
        throw createHttpError(422, `Invalid JSON in ${packagePath}.`);
      } else {
        throw error;
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function selectPackageRunner(projectRoot, packageJson) {
  const knownLocks = ["pnpm-lock.yaml", "bun.lock", "bun.lockb", "package-lock.json"];
  const lockFiles = [];
  for (const name of knownLocks) {
    try {
      await access(join(projectRoot, name));
      lockFiles.push(name);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const environment = buildPublisherEnvironment();
  for (const runner of rankPackageRunners(packageJson, lockFiles)) {
    if (await executableOnPath(runner, environment.PATH)) return runner;
  }
  throw createHttpError(422, "No supported package runner is available. Install npm, pnpm, or Bun.");
}

async function executableOnPath(command, searchPath) {
  const suffixes = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  for (const directory of String(searchPath || "").split(delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      try {
        await access(join(directory, `${command}${suffix}`), 1);
        return true;
      } catch {
        // Unusable PATH entries are expected.
      }
    }
  }
  return false;
}

function publisherCommand(publisher) {
  return `${publisher.runner} run ${publisher.script}`;
}

async function findProjectSourceOccurrences(projectRoot, value) {
  const records = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.isDirectory()) continue;
      if (entry.isDirectory()) {
        if (!SOURCE_IGNORED_DIRECTORIES.has(entry.name)) await visit(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      const absolutePath = join(directory, entry.name);
      const source = await readFile(absolutePath, "utf8");
      const indices = findOccurrences(source, value);
      const descriptions = describeOccurrences(source, value, indices);
      for (let index = 0; index < indices.length; index += 1) {
        records.push({
          ...descriptions[index],
          absolutePath,
          index: indices[index],
          source,
          sourcePath: relative(projectRoot, absolutePath),
        });
      }
    }
  }
  await visit(projectRoot);
  records.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath) || left.index - right.index);
  for (let occurrence = 0; occurrence < records.length; occurrence += 1) records[occurrence].occurrence = occurrence;
  if (records.length === 0) {
    throw createHttpError(
      409,
      "That rendered text was not found in the owning React source. Add a comment so a coding agent can make the structural edit.",
      { code: "source-text-not-found" },
    );
  }
  return records;
}

async function resolveReviewAnnotations(annotations, publisher) {
  const safeAnnotations = Array.isArray(annotations) ? annotations.slice(0, 100) : [];
  if (!publisher) return safeAnnotations;
  return Promise.all(safeAnnotations.map(async (annotation) => {
    const anchor = annotation?.anchor ?? {};
    const value = String(anchor.ownText || anchor.text || "").trim();
    if (!value) return { ...annotation, source: { status: "unresolved", targets: [] } };
    try {
      const records = await findProjectSourceOccurrences(publisher.cwd, value);
      const contentRecords = records.filter((record) => record.role === "content");
      let candidates = contentRecords.length ? contentRecords : records;
      const tagName = String(anchor.tagName || "").toLowerCase();
      const tagMatches = tagName ? candidates.filter((record) => record.tagName === tagName) : [];
      if (tagMatches.length) candidates = tagMatches;
      const targets = candidates.slice(0, 8).map((record) => {
        const position = sourcePosition(record.source, record.index);
        return { column: position.column, line: position.line, path: record.sourcePath };
      });
      return {
        ...annotation,
        source: { status: candidates.length === 1 ? "exact" : "ambiguous", targets },
      };
    } catch (error) {
      if (error?.code !== "source-text-not-found") throw error;
      return { ...annotation, source: { status: "unresolved", targets: [] } };
    }
  }));
}

function selectProjectSourceOccurrences(records, anchor, { occurrence, replaceAll }) {
  if (replaceAll) return records;
  if (Number.isInteger(occurrence)) {
    const selected = records.find((record) => record.occurrence === occurrence);
    if (!selected) throw createHttpError(400, "The selected source occurrence is no longer available.");
    return [selected];
  }
  if (records.length === 1) return records;
  const preferred = anchor?.selector ? records.filter((record) => record.role === "content") : [];
  if (preferred.length === 1) return preferred;
  throw createHttpError(
    409,
    "This text maps to more than one React source string. Choose the occurrence that belongs to the element you clicked.",
    {
      code: "ambiguous-text",
      occurrences: records.map(({ context, label, occurrence: itemOccurrence, sourcePath }) => ({
        context,
        label,
        occurrence: itemOccurrence,
        sourcePath,
      })),
    },
  );
}

function buildProjectSourceChanges(records, before, after) {
  const grouped = new Map();
  for (const record of records) {
    if (!grouped.has(record.absolutePath)) grouped.set(record.absolutePath, []);
    grouped.get(record.absolutePath).push(record);
  }
  return [...grouped.entries()].map(([path, fileRecords]) => {
    const beforeDocument = fileRecords[0].source;
    let afterDocument = beforeDocument;
    for (const record of [...fileRecords].sort((left, right) => right.index - left.index)) {
      const encodedAfter = encodeReplacementForContext(beforeDocument, record.index, before.length, after);
      afterDocument = `${afterDocument.slice(0, record.index)}${encodedAfter}${afterDocument.slice(record.index + before.length)}`;
    }
    return { afterDocument, afterHash: hashSource(afterDocument), beforeDocument, path };
  });
}

function runPublisher(publisher) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(publisher.runner, ["run", publisher.script], {
      cwd: publisher.cwd,
      env: buildPublisherEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk) => {
      output = `${output}${chunk}`.slice(-12_000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => rejectPromise(createHttpError(422, `Publish could not start: ${error.message}`)));
    child.once("close", (code) => {
      const cleaned = output.replace(ANSI_STYLE_PATTERN, "").trim();
      if (code === 0) resolvePromise(cleaned);
      else rejectPromise(createHttpError(422, cleaned || `Publish exited with code ${code}.`));
    });
  });
}

function describeOccurrences(source, value, indices) {
  return indices.map((index, occurrence) => {
    const prefix = source.slice(Math.max(0, index - 180), index);
    const property = prefix.match(/([A-Za-z_$][\w$-]*)\s*:\s*["'`]$/)?.[1] || "";
    const tagName = prefix.match(/<([A-Za-z][\w.:-]*)(?:\s[^<>]*)?>\s*$/s)?.[1]?.toLowerCase() || "";
    const isMarkupText = prefix.trimEnd().endsWith(">")
      && source.slice(index + value.length, index + value.length + 180).trimStart().startsWith("<");
    const role = isMarkupText || /^(?:children|content|text|value)$/i.test(property)
      ? "content"
      : /^(?:ariaLabel|label|name|shortTitle|title)$/i.test(property)
        ? "metadata"
        : "source";
    const label = role === "content"
      ? "Visible element content"
      : role === "metadata"
        ? "Navigation or metadata"
        : "Other source occurrence";
    const contextStart = Math.max(0, index - 72);
    const contextEnd = Math.min(source.length, index + value.length + 72);
    const context = `${source.slice(contextStart, index)}‹${value}›${source.slice(index + value.length, contextEnd)}`
      .replace(/\s+/g, " ")
      .trim();
    return { context, label, occurrence, role, tagName };
  });
}

function sourcePosition(source, index) {
  const prefix = source.slice(0, index);
  const line = prefix.split("\n").length;
  const lastBreak = prefix.lastIndexOf("\n");
  return { column: index - lastBreak, line };
}

function formatSourceTarget(target) {
  return `${cleanInline(target.path)}:${target.line}:${target.column}`;
}

function encodeReplacementForContext(source, index, beforeLength, value) {
  const opening = source[index - 1];
  const closing = source[index + beforeLength];
  if (opening === '"' && closing === '"') {
    return JSON.stringify(value)
      .slice(1, -1)
      .replaceAll("<", "\\u003c")
      .replaceAll(">", "\\u003e")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
  }
  if (opening === "'" && closing === "'") {
    return value
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll("\r", "\\r")
      .replaceAll("\n", "\\n")
      .replaceAll("<", "\\u003c")
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
  }
  if (opening === "`" && closing === "`") {
    return value
      .replaceAll("\\", "\\\\")
      .replaceAll("`", "\\`")
      .replaceAll("${", "\\${")
      .replaceAll("<", "\\u003c");
  }
  return escapeHtmlText(value);
}

function cleanInline(value) {
  return String(value).replaceAll("`", "'").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

function cleanBlock(value) {
  return String(value).replace(/\r\n/g, "\n").trim().slice(0, 20_000);
}

function safeResolve(rootDirectory, relativePath) {
  const normalizedRelative = normalize(relativePath).replace(/^([/\\])+/, "");
  const resolvedPath = resolve(rootDirectory, normalizedRelative);
  const rootPrefix = `${resolve(rootDirectory)}${sep}`;
  if (resolvedPath !== resolve(rootDirectory) && !resolvedPath.startsWith(rootPrefix)) {
    throw createHttpError(403, "Asset path escapes the artifact directory.");
  }
  return resolvedPath;
}

async function atomicWrite(filePath, contents) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    fileStat = null;
  }
  const temporaryPath = join(dirname(filePath), `.${filePath.slice(dirname(filePath).length + 1)}.ve-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", mode: fileStat?.mode ?? 0o644 });
    if (fileStat) await chmod(temporaryPath, fileStat.mode);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function writeDocumentsTransaction(changes, contentsKey, rollbackKey) {
  const written = [];
  try {
    for (const change of changes) {
      await atomicWrite(change.path, change[contentsKey]);
      written.push(change);
    }
  } catch (error) {
    await restoreAfterFailure(
      error,
      written.reverse().map((change) => ({ contents: change[rollbackKey], path: change.path })),
    );
    throw error;
  }
}

async function restoreAfterFailure(originalError, snapshots) {
  const failures = [];
  for (const snapshot of [...snapshots].reverse()) {
    try {
      await atomicWrite(snapshot.path, snapshot.contents);
    } catch (error) {
      failures.push({ error, path: snapshot.path });
    }
  }
  if (failures.length > 0) {
    const rollbackError = createHttpError(
      500,
      "The preview mutation failed and rollback could not restore every affected file.",
      { cause: originalError },
    );
    rollbackError.rollbackFailures = failures;
    throw rollbackError;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) throw createHttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw createHttpError(400, "Request body must be valid JSON.");
  }
}

function parsePatchRequest(value) {
  if (!isRecord(value)) throw createHttpError(400, "Patch request must be a JSON object.");
  for (const key of ["after", "artifactRevision", "before"]) {
    if (!isString(value[key])) throw createHttpError(400, `Patch field "${key}" must be a string.`);
  }
  if (!isRecord(value.anchor) || !isString(value.anchor.selector)) {
    throw createHttpError(400, "Patch field \"anchor\" must identify a selector.");
  }
  if (value.occurrence !== undefined && (!Number.isInteger(value.occurrence) || value.occurrence < 0)) {
    throw createHttpError(400, "Patch field \"occurrence\" must be a non-negative integer.");
  }
  if (value.replaceAll !== undefined && !isBoolean(value.replaceAll)) {
    throw createHttpError(400, "Patch field \"replaceAll\" must be a boolean.");
  }
  return value;
}

function parseAnnotationRequest(value) {
  if (!isRecord(value) || !Array.isArray(value.annotations)) {
    throw createHttpError(400, "Review request must contain an annotations array.");
  }
  if (value.annotations.length > 100) throw createHttpError(400, "Review request supports at most 100 annotations.");
  const annotations = value.annotations.map((annotation, index) => {
    if (!isRecord(annotation) || !isRecord(annotation.anchor)) {
      throw createHttpError(400, `Annotation ${index + 1} is invalid.`);
    }
    if (!isString(annotation.comment) || !isString(annotation.anchor.selector)) {
      throw createHttpError(400, `Annotation ${index + 1} is missing a comment or selector.`);
    }
    return annotation;
  });
  return { annotations };
}

function isRecord(value) {
  if (value === null || Object(value) !== value || Array.isArray(value)) return false;
  try {
    Function.prototype.toString.call(value);
    return false;
  } catch {
    return true;
  }
}

function isString(value) {
  return value !== null && Object(value) !== value && String(value) === value;
}

function isBoolean(value) {
  return value === true || value === false;
}

function parseListeningPort(address, fallback) {
  return isRecord(address) ? address.port : fallback;
}

function setPreviewSessionCookie(response, session) {
  response.setHeader(
    "Set-Cookie",
    `${PREVIEW_SESSION_COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`,
  );
}

function validatePreviewPost(request, session) {
  const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw createHttpError(415, "Preview POST requests require application/json.");
  }

  const cookies = parseCookies(request.headers.cookie);
  if (cookies.get(PREVIEW_SESSION_COOKIE) !== session) {
    throw createHttpError(403, "Invalid preview session.");
  }

  const origin = String(request.headers.origin || "");
  const host = String(request.headers.host || "");
  if (!origin || !host || origin !== `http://${host}`) {
    throw createHttpError(403, "Preview mutations require a same-origin request.");
  }
  const originUrl = new URL(origin);
  if (!isLoopbackHostname(originUrl.hostname)) {
    throw createHttpError(403, "Preview mutations are restricted to the loopback origin.");
  }

  const fetchSite = String(request.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") {
    throw createHttpError(403, "Cross-site preview mutations are not allowed.");
  }
}

function parseCookies(header) {
  const cookies = new Map();
  for (const pair of String(header || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function isLoopbackHostname(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function setSecurityHeaders(response) {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

async function sendFile(response, filePath) {
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream",
    });
    response.end(contents);
  } catch (error) {
    if (error?.code === "ENOENT") throw createHttpError(404, "File not found.");
    throw error;
  }
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function broadcast(clients, event, body) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(body)}\n\n`;
  for (const client of clients) client.write(frame);
}

function openUrl(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function parseCli(argv) {
  let filePath;
  let openBrowser = true;
  let port = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--no-open") openBrowser = false;
    else if (value === "--port") {
      port = Number.parseInt(argv[index + 1], 10);
      index += 1;
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error("--port must be an integer between 0 and 65535.");
      }
    } else if (value.startsWith("-")) throw new Error(`Unknown option: ${value}`);
    else if (!filePath) filePath = isAbsolute(value) ? value : resolve(value);
    else throw new Error("Only one HTML file can be previewed at a time.");
  }
  return { filePath, openBrowser, port };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const options = parseCli(process.argv.slice(2));
    if (!options.filePath) {
      console.error("Usage: node preview.mjs <file.html> [--port 4173] [--no-open]");
      process.exitCode = 1;
    } else {
      const preview = await startPreviewServer(options);
      console.log(`Visual Explainer preview: ${preview.url}`);
      console.log(`Artifact: ${preview.filePath}`);
      console.log("Press Ctrl+C to stop.");
    }
  } catch (error) {
    console.error(`Preview failed: ${error.message}`);
    process.exitCode = 1;
  }
}
