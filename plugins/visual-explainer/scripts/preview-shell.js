import { annotationsForFrame } from "/__ve/annotations.js";

const elements = {
  annotationCount: document.querySelector("#annotation-count"),
  annotationList: document.querySelector("#annotation-list"),
  artifactFrame: document.querySelector("#artifact-frame"),
  backToEdit: document.querySelector("#back-to-edit"),
  cancelComment: document.querySelector("#cancel-comment"),
  cancelEdit: document.querySelector("#cancel-edit"),
  cancelEditConflict: document.querySelector("#cancel-edit-conflict"),
  cancelTargetOptions: document.querySelector("#cancel-target-options"),
  clearButton: document.querySelector("#clear-button"),
  closeCopyFallback: document.querySelector("#close-copy-fallback"),
  collapsedCount: document.querySelector("#collapsed-count"),
  commentTarget: document.querySelector("#comment-target"),
  commentComposer: document.querySelector("#comment-composer"),
  commentInput: document.querySelector("#comment-input"),
  conflictList: document.querySelector("#conflict-list"),
  copyFallback: document.querySelector("#copy-fallback"),
  copyFallbackText: document.querySelector("#copy-fallback-text"),
  copyReviewButton: document.querySelector("#copy-review-button"),
  copyReviewLabel: document.querySelector("#copy-review-label"),
  editBar: document.querySelector("#edit-bar"),
  editConflict: document.querySelector("#edit-conflict"),
  editLabel: document.querySelector("#edit-label"),
  editInnerText: document.querySelector("#edit-inner-text"),
  emptyState: document.querySelector("#empty-state"),
  fileName: document.querySelector("#file-name"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  publishButton: document.querySelector("#publish-button"),
  publishLabel: document.querySelector("#publish-label"),
  previewPane: document.querySelector(".preview-pane"),
  railToggle: document.querySelector("#rail-toggle"),
  reloadButton: document.querySelector("#reload-button"),
  replaceAllConflicts: document.querySelector("#replace-all-conflicts"),
  reviewRail: document.querySelector("#review-rail"),
  reviewMenu: document.querySelector(".review-menu"),
  saveEdit: document.querySelector("#save-edit"),
  selectCopyFallback: document.querySelector("#select-copy-fallback"),
  selectionLabel: document.querySelector("#selection-label"),
  status: document.querySelector("#status"),
  targetOptions: document.querySelector("#target-options"),
  targetOptionsDescription: document.querySelector("#target-options-description"),
  toastRegion: document.querySelector("#toast-region"),
  undoButton: document.querySelector("#undo-button"),
  workspace: document.querySelector(".workspace"),
  copyTargetContext: document.querySelector("#copy-target-context"),
  dismissCopyFallback: document.querySelector("#dismiss-copy-fallback"),
};

const state = {
  annotations: [],
  conflict: null,
  draft: null,
  edit: null,
  frameHash: location.hash,
  meta: null,
  mode: "browse",
  publishing: false,
  railCollapsed: false,
  reloadTimer: null,
  saving: false,
  unavailable: null,
};

const MODE_LABELS = {
  browse: "Preview mode",
  comment: "Comment mode",
  edit: "Edit text mode",
};

await initialize();

async function initialize() {
  try {
    state.meta = await requestJson("/__ve/meta");
    elements.fileName.textContent = state.meta.fileName;
    elements.fileName.title = state.meta.filePath;
    elements.undoButton.disabled = !state.meta.canUndo;
    elements.publishButton.disabled = !state.meta.publisher;
    elements.publishButton.title = state.meta.publisher
      ? `Run ${state.meta.publisher.command} in ${state.meta.publisher.projectRoot}`
      : "No publish, export, or build script was found";
    restoreAnnotations();
    restoreRailState();
    renderAnnotations();
    wireEvents();
    elements.artifactFrame.src = artifactUrlWithHash();
    connectEvents();
    setStatus("");
  } catch (error) {
    setStatus("Preview failed");
    showToast(error.message, true);
  }
}

function wireEvents() {
  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  }
  elements.commentComposer.addEventListener("submit", addAnnotation);
  elements.commentInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      elements.commentComposer.requestSubmit();
    }
  });
  elements.cancelComment.addEventListener("click", cancelDraft);
  elements.cancelEdit.addEventListener("click", cancelEdit);
  elements.cancelEditConflict.addEventListener("click", closeEditConflict);
  elements.backToEdit.addEventListener("click", closeEditConflict);
  elements.cancelTargetOptions.addEventListener("click", closeTargetOptions);
  elements.commentTarget.addEventListener("click", commentOnUnavailableTarget);
  elements.closeCopyFallback.addEventListener("click", closeManualCopy);
  elements.dismissCopyFallback.addEventListener("click", closeManualCopy);
  elements.editInnerText.addEventListener("click", editUnavailableCandidate);
  elements.copyTargetContext.addEventListener("click", copyUnavailableContext);
  elements.saveEdit.addEventListener("click", () => postToFrame("commit-edit"));
  elements.reloadButton.addEventListener("click", () => {
    closeActionMenu(elements.reloadButton);
    reloadArtifact("Reloaded");
  });
  elements.publishButton.addEventListener("click", publishHtml);
  elements.replaceAllConflicts.addEventListener("click", resolveAllConflicts);
  elements.railToggle.addEventListener("click", () => setRailCollapsed(!state.railCollapsed));
  elements.undoButton.addEventListener("click", () => {
    closeActionMenu(elements.undoButton);
    undoEdit();
  });
  elements.clearButton.addEventListener("click", () => {
    closeActionMenu(elements.clearButton);
    clearAnnotations();
  });
  elements.copyReviewButton.addEventListener("click", copyReview);
  elements.selectCopyFallback.addEventListener("click", selectManualCopy);
  document.addEventListener("click", closeMenusOutsideClick);
  window.addEventListener("message", handleBridgeMessage);
  window.addEventListener("hashchange", handleHostHashChange);
  window.addEventListener("keydown", handleGlobalShortcut);
  window.addEventListener("resize", () => {
    if (state.draft) positionComposer(state.draft.rect);
    if (state.unavailable) positionTargetOptions(state.unavailable.rect);
  });
}

function connectEvents() {
  const events = new EventSource("/__ve/events");
  events.addEventListener("artifact-changed", (event) => {
    const payload = safeJson(event.data);
    if (payload?.artifactRevision) state.meta.artifactRevision = payload.artifactRevision;
    if (state.saving || state.publishing) return;
    if (state.edit) {
      showToast("The source changed while you were editing. Cancel or save to resolve it.", true);
      return;
    }
    scheduleReload(payload?.reason === "external-change" ? "Source changed · preview refreshed" : "Preview refreshed");
  });
  events.addEventListener("artifact-missing", () => {
    setStatus("Artifact missing");
    showToast("The HTML file is no longer available.", true);
  });
  events.addEventListener("artifact-error", () => {
    setStatus("Preview read failed");
    showToast("The preview could not read the HTML file. Check the server log.", true);
  });
}

function handleBridgeMessage(event) {
  if (event.source !== elements.artifactFrame.contentWindow) return;
  const message = event.data;
  if (!isRecord(message) || message.source !== "ve-preview-bridge" || message.session !== state.meta?.session || typeof message.type !== "string") return;

  switch (message.type) {
    case "bridge-ready":
      syncFrameHash(message.locationHash || state.frameHash);
      postToFrame("set-mode", { mode: state.mode });
      syncMarkers();
      break;
    case "location-state":
      syncFrameHash(message.locationHash);
      syncMarkers();
      break;
    case "target-selected":
      if (state.mode !== "comment" || !isAnchor(message.anchor) || !isRect(message.rect)) return;
      openCommentDraft(message.anchor, message.rect);
      break;
    case "edit-start":
      if (state.mode !== "edit" || !isAnchor(message.anchor) || typeof message.before !== "string") return;
      closeTargetOptions();
      closeEditConflict();
      state.edit = {
        anchor: message.anchor,
        before: message.before,
        value: message.before,
        artifactRevision: state.meta.artifactRevision,
      };
      elements.editLabel.textContent = `Editing ${message.anchor.label}`;
      elements.editBar.hidden = false;
      setStatus("Editing text · ⌘ Enter to save");
      break;
    case "edit-change":
      if (state.edit && typeof message.value === "string") state.edit.value = message.value;
      break;
    case "edit-commit":
      if (state.edit && typeof message.value === "string") commitEdit(message.value);
      break;
    case "edit-cancelled":
      closeEditConflict();
      finishEdit("Edit cancelled");
      break;
    case "marker-click":
      if (typeof message.id === "string") focusAnnotation(message.id);
      break;
    case "target-unavailable":
      if (isAnchor(message.anchor) && isRect(message.rect)) openTargetOptions(message);
      break;
  }
}

function postToFrame(type, payload = {}) {
  if (!elements.artifactFrame.contentWindow || !state.meta) return;
  elements.artifactFrame.contentWindow.postMessage(
    { ...payload, source: "ve-preview-host", session: state.meta.session, type },
    "*",
  );
}

function normalizeHash(hash) {
  if (!hash || hash === "#") return "";
  return hash.startsWith("#") ? hash : `#${hash}`;
}

function syncFrameHash(hash) {
  const nextHash = normalizeHash(hash);
  state.frameHash = nextHash;
  if (location.hash === nextHash) return;
  history.replaceState(history.state, "", `${location.pathname}${location.search}${nextHash}`);
}

function handleHostHashChange() {
  const nextHash = normalizeHash(location.hash);
  if (nextHash === state.frameHash) return;
  state.frameHash = nextHash;
  syncMarkers();
  postToFrame("set-location", { locationHash: nextHash });
}

function setMode(mode) {
  if (!MODE_LABELS[mode] || mode === state.mode) return;
  if (state.draft) cancelDraft();
  if (state.conflict) closeEditConflict();
  if (state.edit) cancelEdit();
  closeTargetOptions();
  state.mode = mode;
  for (const button of elements.modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  postToFrame("set-mode", { mode });
  setStatus(MODE_LABELS[mode]);
}

function openCommentDraft(anchor, rect) {
  closeTargetOptions();
  state.draft = { anchor, rect };
  elements.selectionLabel.textContent = `${anchor.label} · ${anchor.selector}`;
  elements.commentComposer.hidden = false;
  positionComposer(rect);
  requestAnimationFrame(() => elements.commentInput.focus());
}

function openTargetOptions(message) {
  if (state.mode !== "edit" || !message.anchor) return;
  state.unavailable = {
    anchor: message.anchor,
    candidate: message.candidate || null,
    rect: message.rect,
  };
  elements.targetOptionsDescription.textContent = message.reason === "generated-or-interactive"
    ? "This is interactive, media, or runtime-generated content. It does not map safely to one editable source string."
    : "This element contains several text nodes or inline formatting. Replacing it as one string could damage the markup.";
  elements.editInnerText.hidden = !message.candidate;
  if (message.candidate) elements.editInnerText.textContent = `Edit inner text · ${message.candidate.label}`;
  elements.targetOptions.hidden = false;
  positionTargetOptions(message.rect);
}

function closeTargetOptions() {
  state.unavailable = null;
  elements.targetOptions.hidden = true;
}

function commentOnUnavailableTarget() {
  if (!state.unavailable) return;
  const { anchor, rect } = state.unavailable;
  setMode("comment");
  postToFrame("select-anchor", { anchor });
  openCommentDraft(anchor, rect);
}

function editUnavailableCandidate() {
  const selector = state.unavailable?.candidate?.selector;
  if (!selector) return;
  closeTargetOptions();
  postToFrame("start-edit-candidate", { selector });
}

async function copyUnavailableContext() {
  if (!state.unavailable) return;
  const { anchor } = state.unavailable;
  const context = [
    `${anchor.label} · ${anchor.selector}`,
    anchor.text ? `Visible text: ${anchor.text}` : "",
    anchor.html ? `\n${anchor.html}` : "",
  ].filter(Boolean).join("\n");
  if (await copyText(context)) showToast("Element context copied");
  else openManualCopy(context, "Copy element context");
}

function addAnnotation(event) {
  event.preventDefault();
  const comment = elements.commentInput.value.trim();
  if (!state.draft || !comment) {
    if (!comment) elements.commentInput.focus();
    return;
  }

  const annotation = {
    anchor: reviewAnchor(state.draft.anchor),
    comment,
    id: globalThis.crypto?.randomUUID?.() || `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    number: nextAnnotationNumber(),
  };
  replaceAnnotations([...state.annotations, annotation]);
  setRailCollapsed(false);
  cancelDraft(false);
  postToFrame("clear-selection");
  showToast(`Note ${annotation.number} added · click the next element`);
  setStatus("Comment mode · ready for the next note");
}

function cancelDraft(notifyFrame = true) {
  state.draft = null;
  elements.commentInput.value = "";
  elements.commentComposer.hidden = true;
  if (notifyFrame) postToFrame("clear-selection");
}

function nextAnnotationNumber() {
  return state.annotations.reduce((highest, item) => Math.max(highest, item.number || 0), 0) + 1;
}

function replaceAnnotations(annotations) {
  state.annotations = annotations;
  persistAnnotations();
  renderAnnotations();
  syncMarkers();
}

function renderAnnotations() {
  const hasAnnotations = state.annotations.length > 0;
  elements.annotationCount.textContent = String(state.annotations.length);
  elements.collapsedCount.textContent = String(state.annotations.length);
  elements.collapsedCount.hidden = !hasAnnotations;
  elements.emptyState.hidden = hasAnnotations;
  elements.annotationList.classList.toggle("has-items", hasAnnotations);
  elements.clearButton.disabled = !hasAnnotations;
  elements.reviewMenu.hidden = !hasAnnotations;
  elements.copyReviewButton.disabled = !hasAnnotations;
  elements.copyReviewLabel.textContent = copyReviewLabel();
  elements.annotationList.replaceChildren(
    ...state.annotations.map((annotation) => createAnnotationCard(annotation)),
  );
}

function createAnnotationCard(annotation) {
  const item = document.createElement("li");
  item.className = "annotation-card";
  item.dataset.annotationId = annotation.id;
  item.tabIndex = 0;

  const number = document.createElement("span");
  number.className = "annotation-number";
  number.textContent = String(annotation.number);

  const copy = document.createElement("div");
  copy.className = "annotation-copy";
  const target = document.createElement("p");
  target.className = "annotation-target";
  target.textContent = annotationTargetLabel(annotation.anchor);
  const comment = document.createElement("p");
  comment.className = "annotation-comment";
  comment.textContent = annotation.comment;
  copy.append(comment, target);

  const remove = document.createElement("button");
  remove.className = "delete-note";
  remove.type = "button";
  remove.ariaLabel = `Delete note ${annotation.number}`;
  remove.innerHTML = '<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    replaceAnnotations(state.annotations.filter((item) => item.id !== annotation.id));
  });

  const focus = () => postToFrame("focus-marker", { id: annotation.id });
  item.addEventListener("click", focus);
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      focus();
    }
  });
  item.append(number, copy, remove);
  return item;
}

function focusAnnotation(id) {
  const card = elements.annotationList.querySelector(`[data-annotation-id="${CSS.escape(id)}"]`);
  if (!card) return;
  for (const item of elements.annotationList.querySelectorAll(".is-focused")) item.classList.remove("is-focused");
  card.classList.add("is-focused");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.setTimeout(() => card.classList.remove("is-focused"), 1_500);
}

function syncMarkers() {
  postToFrame("set-markers", {
    annotations: annotationsForFrame(state.annotations, state.frameHash)
      .map(({ anchor, id, number }) => ({ anchor, id, number })),
  });
}

function annotationTargetLabel(anchor) {
  const tagName = String(anchor.tagName || "").toLowerCase();
  const role = {
    h1: "Title",
    h2: "Heading",
    h3: "Heading",
    h4: "Heading",
    button: "Button",
    a: "Link",
    li: "List item",
    p: "Paragraph",
  }[tagName] || anchor.label || "Element";
  const text = String(anchor.ownText || anchor.text || "").replace(/\s+/g, " ").trim().slice(0, 72);
  return text ? `${role} · “${text}”` : role;
}

function copyReviewLabel() {
  const count = state.annotations.length;
  return count ? `Copy ${count} note${count === 1 ? "" : "s"}` : "Copy notes";
}

function clearAnnotations() {
  if (!state.annotations.length) return;
  replaceAnnotations([]);
  showToast("Notes cleared");
}

async function commitEdit(value, resolution = {}) {
  if (!state.edit || state.saving) return;
  const after = typeof value === "string" ? value : state.edit.value;
  if (after === state.edit.before) {
    cancelEdit();
    return;
  }
  state.saving = true;
  elements.saveEdit.disabled = true;
  setStatus("Saving text…");
  try {
    const result = await patchText(after, resolution);
    state.meta.artifactRevision = result.artifactRevision;
    state.meta.canUndo = result.canUndo;
    elements.undoButton.disabled = !result.canUndo;
    closeEditConflict();
    postToFrame("edit-saved");
    const sourceLabel = result.sourcePaths?.length ? result.sourcePaths.join(", ") : "HTML source";
    finishEdit(result.rebuilt ? `Saved ${sourceLabel} · rebuilt HTML` : "Text saved · current slide preserved");
    syncMarkers();
    if (result.rebuilt) reloadArtifact(`Saved ${sourceLabel} · rebuilt HTML`);
    showToast(result.rebuilt ? `React source saved · ${sourceLabel}` : "Text saved to the HTML source");
  } catch (error) {
    if (error.code === "ambiguous-text" && Array.isArray(error.occurrences)) {
      openEditConflict(error.occurrences, after);
      return;
    }
    closeEditConflict();
    postToFrame("cancel-edit");
    finishEdit("Edit not saved");
    showToast(error.message, true);
  } finally {
    state.saving = false;
    elements.saveEdit.disabled = false;
  }
}

function patchText(after, { occurrence, replaceAll = false } = {}) {
  return requestJson("/__ve/patch", {
    method: "POST",
    body: JSON.stringify({
      after,
      anchor: state.edit.anchor,
      before: state.edit.before,
      artifactRevision: state.edit.artifactRevision,
      occurrence,
      replaceAll,
    }),
  });
}

function openEditConflict(occurrences, after) {
  state.conflict = { after };
  elements.conflictList.replaceChildren(...occurrences.map((item) => {
    const button = document.createElement("button");
    button.className = "conflict-choice";
    button.type = "button";
    const label = document.createElement("strong");
    label.textContent = item.sourcePath
      ? `${item.label || "Source occurrence"} · ${item.sourcePath}`
      : item.label || `Source occurrence ${item.occurrence + 1}`;
    const context = document.createElement("code");
    context.textContent = item.context || state.edit.before;
    button.append(label, context);
    button.addEventListener("click", () => resolveConflict(item.occurrence));
    return button;
  }));
  elements.replaceAllConflicts.textContent = `Update all ${occurrences.length} matches`;
  elements.editConflict.hidden = false;
  postToFrame("edit-conflict");
  requestAnimationFrame(() => elements.conflictList.querySelector("button")?.focus());
  setStatus("Choose a source occurrence");
}

function closeEditConflict() {
  state.conflict = null;
  elements.editConflict.hidden = true;
  elements.conflictList.replaceChildren();
  if (state.edit) setStatus("Editing text · ⌘ Enter to save");
}

function resolveConflict(occurrence) {
  const after = state.conflict?.after;
  if (typeof after !== "string") return;
  closeEditConflict();
  commitEdit(after, { occurrence });
}

function resolveAllConflicts() {
  const after = state.conflict?.after;
  if (typeof after !== "string") return;
  closeEditConflict();
  commitEdit(after, { replaceAll: true });
}

function cancelEdit() {
  closeEditConflict();
  postToFrame("cancel-edit");
  finishEdit("Edit cancelled");
}

function finishEdit(status) {
  state.edit = null;
  elements.editBar.hidden = true;
  setStatus(status);
}

async function undoEdit() {
  if (state.saving) return;
  state.saving = true;
  elements.undoButton.disabled = true;
  try {
    const result = await requestJson("/__ve/undo", { method: "POST", body: "{}" });
    state.meta.artifactRevision = result.artifactRevision;
    state.meta.canUndo = result.canUndo;
    elements.undoButton.disabled = !result.canUndo;
    if (result.rebuilt) reloadArtifact("React edit undone · rebuilt HTML");
    else {
      postToFrame("apply-visible-text", { from: result.after, to: result.before });
      syncMarkers();
      setStatus("Edit undone · current slide preserved");
    }
    showToast("Last preview text edit undone");
  } catch (error) {
    showToast(error.message, true);
    elements.undoButton.disabled = !state.meta.canUndo;
  } finally {
    state.saving = false;
  }
}

async function copyReview() {
  const count = state.annotations.length;
  elements.copyReviewButton.disabled = true;
  elements.copyReviewLabel.textContent = "Locating source…";
  setStatus("Resolving annotation source locations…");
  let markdown;
  let mappingUnavailable = false;
  let resolved = 0;
  try {
    const result = await requestJson("/__ve/review", {
      method: "POST",
      body: JSON.stringify({ annotations: state.annotations }),
    });
    markdown = result.markdown;
    resolved = result.resolved || 0;
  } catch (error) {
    markdown = formatReviewForClipboard();
    mappingUnavailable = true;
  }
  if (!(await copyText(markdown))) {
    elements.copyReviewButton.disabled = false;
    elements.copyReviewLabel.textContent = copyReviewLabel();
    openManualCopy(markdown, "Copy review for your coding agent");
    return;
  }
  elements.copyReviewLabel.textContent = `Copied ${count} note${count === 1 ? "" : "s"}`;
  elements.copyReviewButton.classList.add("is-confirmed");
  setStatus(mappingUnavailable
    ? "Review copied with DOM targets · source mapping unavailable"
    : `Review copied · ${resolved}/${count} mapped to React source`);
  showToast(mappingUnavailable
    ? `${count} note${count === 1 ? "" : "s"} copied with DOM targets`
    : `${count} compact note${count === 1 ? "" : "s"} copied · ${resolved} source-mapped`, mappingUnavailable);
  window.setTimeout(() => {
    elements.copyReviewLabel.textContent = copyReviewLabel();
    elements.copyReviewButton.classList.remove("is-confirmed");
    elements.copyReviewButton.disabled = state.annotations.length === 0;
  }, 2_200);
}

async function publishHtml() {
  if (state.publishing || state.saving) return;
  if (state.edit) {
    showToast("Save or cancel the active text edit before publishing.", true);
    return;
  }
  state.publishing = true;
  elements.publishButton.disabled = true;
  elements.publishButton.classList.add("is-publishing");
  elements.publishLabel.textContent = "Publishing…";
  setStatus(`Running ${state.meta.publisher.command}…`);
  try {
    const result = await requestJson("/__ve/publish", { method: "POST", body: "{}" });
    state.meta.artifactRevision = result.artifactRevision;
    state.meta.canUndo = false;
    elements.undoButton.disabled = true;
    const destination = result.publishedFiles?.at(-1) || result.outputPath || state.meta.fileName;
    reloadArtifact(`Published · ${destination}`);
    showToast(`Published to ${destination} in ${(result.durationMs / 1_000).toFixed(1)}s`);
  } catch (error) {
    showToast(error.message, true);
    setStatus("Publish failed");
  } finally {
    state.publishing = false;
    elements.publishButton.disabled = !state.meta.publisher;
    elements.publishButton.classList.remove("is-publishing");
    elements.publishLabel.textContent = "Publish";
  }
}

async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  }
}

function openManualCopy(text, title) {
  elements.copyFallback.querySelector("h2").textContent = title;
  elements.copyFallbackText.value = text;
  elements.copyFallback.hidden = false;
  selectManualCopy();
  setStatus("Manual copy ready");
}

function selectManualCopy() {
  elements.copyFallbackText.focus();
  elements.copyFallbackText.select();
}

function closeManualCopy() {
  elements.copyFallback.hidden = true;
  elements.copyFallbackText.value = "";
}

function formatReviewForClipboard() {
  const lines = [
    "Address these visual review notes. Edit source files, not generated HTML.",
    "",
  ];
  for (const annotation of state.annotations) {
    const anchor = annotation.anchor;
    const text = String(anchor.ownText || anchor.text || "").replace(/\s+/g, " ").trim().slice(0, 100);
    const location = anchor.location ? ` at \`${anchor.location}\`` : "";
    lines.push(`${annotation.number}. DOM \`${anchor.selector}\`${location} — <${anchor.tagName || "element"}>${text ? ` “${text}”` : ""} — ${annotation.comment}`, "");
  }
  return lines.join("\n");
}

function restoreAnnotations() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    state.annotations = Array.isArray(stored)
      ? stored.slice(0, 100).map(normalizeStoredAnnotation).filter(Boolean)
      : [];
  } catch {
    state.annotations = [];
    localStorage.removeItem(storageKey());
    showToast("Stored review notes were invalid and have been cleared.", true);
  }
}

function normalizeStoredAnnotation(item, index) {
  if (!item || typeof item !== "object") return null;
  const anchor = item.anchor;
  if (!anchor || typeof anchor !== "object") return null;
  if (typeof item.id !== "string" || typeof item.comment !== "string" || typeof anchor.selector !== "string") return null;
  return {
    anchor: reviewAnchor(anchor),
    comment: item.comment.slice(0, 20_000),
    id: item.id,
    number: Number.isInteger(item.number) && item.number > 0 ? item.number : index + 1,
  };
}

function reviewAnchor(anchor) {
  return {
    label: typeof anchor.label === "string" ? anchor.label : "Element",
    location: typeof anchor.location === "string" ? anchor.location : "",
    ownText: typeof anchor.ownText === "string" ? anchor.ownText : "",
    point: anchor.point && Number.isFinite(anchor.point.x) && Number.isFinite(anchor.point.y)
      ? { x: anchor.point.x, y: anchor.point.y }
      : null,
    selector: anchor.selector,
    tagName: typeof anchor.tagName === "string" ? anchor.tagName : "",
    text: typeof anchor.text === "string" ? anchor.text : "",
  };
}

function persistAnnotations() {
  localStorage.setItem(storageKey(), JSON.stringify(state.annotations));
}

function restoreRailState() {
  setRailCollapsed(localStorage.getItem(`${storageKey()}:rail-collapsed`) === "true", false);
}

function setRailCollapsed(collapsed, persist = true) {
  state.railCollapsed = collapsed;
  elements.workspace.classList.toggle("is-rail-collapsed", collapsed);
  elements.reviewRail.classList.toggle("is-collapsed", collapsed);
  elements.railToggle.setAttribute("aria-expanded", String(!collapsed));
  elements.railToggle.setAttribute("aria-label", collapsed ? "Expand review queue" : "Collapse review queue");
  elements.railToggle.title = collapsed ? "Expand review queue" : "Collapse review queue";
  if (persist && state.meta) localStorage.setItem(`${storageKey()}:rail-collapsed`, String(collapsed));
}

function closeActionMenu(element) {
  element.closest("details")?.removeAttribute("open");
}

function closeMenusOutsideClick(event) {
  for (const menu of document.querySelectorAll(".action-menu[open]")) {
    if (!menu.contains(event.target)) menu.removeAttribute("open");
  }
}

function storageKey() {
  return `visual-explainer-review:${state.meta.filePath}`;
}

function positionFloatingPanel(element, rect) {
  if (!rect || element.hidden) return;
  const paneRect = elements.previewPane.getBoundingClientRect();
  const panelRect = element.getBoundingClientRect();
  const desiredLeft = rect.right + 12;
  const fallbackLeft = rect.left - panelRect.width - 12;
  const left = desiredLeft + panelRect.width <= paneRect.width - 14 ? desiredLeft : Math.max(14, fallbackLeft);
  const top = Math.min(
    Math.max(14, rect.top),
    Math.max(14, paneRect.height - panelRect.height - 14),
  );
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

function positionComposer(rect) {
  positionFloatingPanel(elements.commentComposer, rect);
}

function positionTargetOptions(rect) {
  positionFloatingPanel(elements.targetOptions, rect);
}

function handleGlobalShortcut(event) {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
  if (event.key === "Escape") {
    if (!elements.copyFallback.hidden) closeManualCopy();
    else if (state.conflict) closeEditConflict();
    else if (state.unavailable) closeTargetOptions();
    else if (state.draft) cancelDraft();
    else if (state.edit) cancelEdit();
    return;
  }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.toLowerCase() === "v") setMode("browse");
  if (event.key.toLowerCase() === "c") setMode("comment");
  if (event.key.toLowerCase() === "e") setMode("edit");
}

function reloadArtifact(status = "Preview refreshed") {
  const url = new URL(state.meta.artifactUrl, location.href);
  url.searchParams.set("ve", Date.now().toString());
  url.hash = state.frameHash;
  elements.artifactFrame.src = url.pathname + url.search + url.hash;
  setStatus(status);
}

function artifactUrlWithHash() {
  const url = new URL(state.meta.artifactUrl, location.href);
  url.hash = state.frameHash;
  return url.pathname + url.search + url.hash;
}

function scheduleReload(status) {
  clearTimeout(state.reloadTimer);
  state.reloadTimer = window.setTimeout(() => reloadArtifact(status), 120);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3_400);
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new Error(`The preview server returned invalid JSON for ${url}.`);
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    Object.assign(error, body);
    throw error;
  }
  return body;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAnchor(value) {
  return isRecord(value) && typeof value.selector === "string";
}

function isRect(value) {
  return isRecord(value)
    && ["bottom", "height", "left", "right", "top", "width"].every((key) => Number.isFinite(value[key]));
}
