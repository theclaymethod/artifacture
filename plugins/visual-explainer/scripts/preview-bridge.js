(() => {
  "use strict";

  const scriptUrl = new URL(document.currentScript.src);
  const session = scriptUrl.searchParams.get("session");
  const SOURCE = "ve-preview-bridge";
  const TARGET_SOURCE = "ve-preview-host";
  const EXCLUDED_TARGET_SELECTOR = "html, body, main, [data-ve-no-annotate-self]";
  const NON_TARGET_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "HEAD"]);
  const NON_EDIT_TAGS = new Set([
    "A", "BUTTON", "CANVAS", "CODE", "IFRAME", "IMG", "INPUT", "OPTION", "PRE", "SCRIPT", "SELECT", "STYLE", "TEXTAREA", "VIDEO",
  ]);
  const EDIT_NAVIGATION_KEYS = new Set([
    " ", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", "Spacebar",
  ]);
  const MARKER_LIMIT = 200;

  installStorageFallback("localStorage");
  installStorageFallback("sessionStorage");

  let activeEdit = null;
  let hoverTarget = null;
  let mode = "browse";
  let selectedTarget = null;
  let markerRecords = [];
  let reconcileQueued = false;
  const previousCursor = document.documentElement.style.cursor;

  const overlayHost = document.createElement("div");
  overlayHost.id = "__ve_preview_overlay";
  overlayHost.setAttribute("aria-hidden", "true");
  Object.assign(overlayHost.style, {
    all: "initial",
    contain: "layout style paint",
    inset: "0",
    pointerEvents: "none",
    position: "fixed",
    zIndex: "2147483647",
  });
  const shadow = overlayHost.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .box {
        position: fixed;
        display: none;
        border: 2px solid #93a8b7;
        border-radius: 0;
        background: rgba(147, 168, 183, 0.055);
        box-shadow: 3px 3px 0 rgba(7, 10, 12, 0.42);
        pointer-events: none;
      }
      .box.editable {
        border-color: #79ad91;
        background: rgba(121, 173, 145, 0.055);
        box-shadow: 0 0 0 1px rgba(8, 28, 19, 0.5), 0 0 0 4px rgba(121, 173, 145, 0.1);
      }
      .box.locked { border-style: solid; background: rgba(147, 168, 183, 0.1); }
      .label {
        position: absolute;
        top: -25px;
        left: -2px;
        max-width: min(320px, 70vw);
        height: 21px;
        overflow: hidden;
        padding: 4px 7px;
        border: 1px solid #93a8b7;
        border-radius: 0;
        background: #15181b;
        color: #e7ebee;
        font: 600 10px/13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .editable .label { border-color: #79ad91; background: #142019; }
      .markers { position: fixed; inset: 0; pointer-events: none; }
      .marker {
        position: fixed;
        display: grid;
        place-items: center;
        width: 25px;
        height: 25px;
        padding: 0;
        border: 1px solid #dce2e6;
        border-radius: 0;
        outline: 0;
        background: #8298a7;
        box-shadow: 4px 4px 0 rgba(17,18,20,.54);
        color: #0d1114;
        cursor: pointer;
        font: 750 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        pointer-events: auto;
        transform: translate(-50%, -100%);
        transform-origin: 50% 100%;
        transition: scale 120ms ease, filter 120ms ease;
      }
      .marker > span { transform: none; }
      .marker:hover, .marker:focus-visible { filter: brightness(1.18); scale: 1.12; }
      .marker.pulse { animation: pulse 680ms ease-out; }
      @keyframes pulse {
        0%, 100% { filter: none; scale: 1; }
        45% { filter: brightness(1.3); scale: 1.35; }
      }
    </style>
    <div class="box" id="hover-box"><span class="label"></span></div>
    <div class="box locked" id="selected-box"><span class="label"></span></div>
    <div class="markers" id="markers"></div>
  `;

  const hoverBox = shadow.querySelector("#hover-box");
  const hoverLabel = hoverBox.querySelector(".label");
  const selectedBox = shadow.querySelector("#selected-box");
  const selectedLabel = selectedBox.querySelector(".label");
  const markersLayer = shadow.querySelector("#markers");
  document.documentElement.append(overlayHost);

  window.addEventListener("message", handleHostMessage);
  window.addEventListener("mousemove", handlePointerMove, true);
  window.addEventListener("click", handleClick, true);
  window.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("beforeinput", handleBeforeInput, true);
  window.addEventListener("input", handleInput, true);
  window.addEventListener("paste", handlePaste, true);
  window.addEventListener("scroll", scheduleReconcile, true);
  window.addEventListener("resize", scheduleReconcile, true);
  installLocationReporting();
  new ResizeObserver(scheduleReconcile).observe(document.documentElement);

  post("bridge-ready", { locationHash: location.hash });

  function installStorageFallback(property) {
    try {
      void window[property].length;
    } catch {
      const values = new Map();
      const storage = {
        clear() { values.clear(); },
        getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
        key(index) { return [...values.keys()][index] ?? null; },
        get length() { return values.size; },
        removeItem(key) { values.delete(String(key)); },
        setItem(key, value) { values.set(String(key), String(value)); },
      };
      try {
        Object.defineProperty(window, property, { configurable: true, value: storage });
      } catch {
        // Some browsers expose non-configurable storage accessors.
      }
    }
  }

  function handleHostMessage(event) {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!isRecord(message) || message.source !== TARGET_SOURCE || message.session !== session || typeof message.type !== "string") return;
    switch (message.type) {
      case "set-mode":
        setMode(message.mode);
        break;
      case "clear-selection":
        selectedTarget = null;
        hideBox(selectedBox);
        break;
      case "set-markers":
        setMarkers(message.annotations);
        break;
      case "focus-marker":
        focusMarker(message.id);
        break;
      case "select-anchor":
        selectAnchor(message.anchor);
        break;
      case "start-edit-candidate":
        startEditCandidate(message.selector);
        break;
      case "commit-edit":
        requestEditCommit();
        break;
      case "cancel-edit":
        cancelEditing(false);
        break;
      case "edit-saved":
        finishSavedEdit();
        break;
      case "edit-conflict":
        if (activeEdit) activeEdit.pending = false;
        break;
      case "apply-visible-text":
        applyVisibleText(message.from, message.to);
        break;
      case "set-location":
        if (typeof message.locationHash === "string" && location.hash !== message.locationHash) location.hash = message.locationHash;
        break;
    }
  }

  function installLocationReporting() {
    const report = () => post("location-state", { locationHash: location.hash });
    window.addEventListener("hashchange", report);
    window.addEventListener("popstate", report);
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      try {
        history[method] = function (...args) {
          const result = original.apply(this, args);
          queueMicrotask(report);
          return result;
        };
      } catch {
        // Hashchange and popstate still cover direct URL navigation.
      }
    }
  }

  function setMode(nextMode) {
    if (!["browse", "comment", "edit"].includes(nextMode)) return;
    if (activeEdit && nextMode !== "edit") cancelEditing();
    mode = nextMode;
    hoverTarget = null;
    hideBox(hoverBox);
    if (mode !== "comment") {
      selectedTarget = null;
      hideBox(selectedBox);
    }
    document.documentElement.style.cursor = mode === "comment" ? "crosshair" : mode === "edit" ? "text" : previousCursor;
  }

  function handlePointerMove(event) {
    if (mode === "browse" || activeEdit) return;
    const target = pickTarget(event.clientX, event.clientY);
    if (!target) {
      hoverTarget = null;
      hideBox(hoverBox);
      return;
    }
    if (target === hoverTarget) return;
    hoverTarget = target;
    const editable = mode === "edit" && canEdit(target);
    drawBox(hoverBox, target, semanticLabel(target), editable);
  }

  function handleClick(event) {
    if (mode === "browse") return;
    if (activeEdit) {
      if (activeEdit.element.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const target = pickTarget(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (mode === "edit") {
      if (!canEdit(target)) {
        const anchor = createAnchor(target, event.clientX, event.clientY);
        const candidate = findEditableDescendant(target);
        post("target-unavailable", {
          anchor,
          candidate: candidate
            ? { label: semanticLabel(candidate), selector: uniqueSelector(candidate) }
            : null,
          reason: NON_EDIT_TAGS.has(target.tagName) ? "generated-or-interactive" : "nested-content",
          rect: plainRect(target.getBoundingClientRect()),
        });
        return;
      }
      beginEditing(target);
      return;
    }

    selectedTarget = target;
    const anchor = createAnchor(target, event.clientX, event.clientY);
    drawBox(selectedBox, target, anchor.label, false);
    post("target-selected", { anchor, rect: plainRect(target.getBoundingClientRect()) });
  }

  function pickTarget(x, y) {
    let target = document.elementFromPoint(x, y);
    if (!target || target === overlayHost) return null;
    if (target.matches?.(EXCLUDED_TARGET_SELECTOR)) return null;
    while (target && NON_TARGET_TAGS.has(target.tagName)) target = target.parentElement;
    const interactiveAncestor = target?.closest?.("button, a, [role='button'], [role='link']");
    if (interactiveAncestor) target = interactiveAncestor;
    else if (target?.tagName === "PATH" || target?.tagName === "USE") target = target.closest("svg") || target;
    if (isPreviewChrome(target)) return null;
    while (target && target !== document.body && target !== document.documentElement) {
      const rect = target.getBoundingClientRect();
      if ((rect.width >= 16 || rect.height >= 16) && rect.width > 0 && rect.height > 0) break;
      target = target.parentElement;
    }
    if (!target || target === document.documentElement) return document.body;
    return target;
  }

  function canEdit(element) {
    if (!element || NON_EDIT_TAGS.has(element.tagName)) return false;
    if (element.isContentEditable || element.closest("[contenteditable], [data-ve-no-edit]")) return false;
    if (element.childNodes.length !== 1 || element.firstChild?.nodeType !== Node.TEXT_NODE) return false;
    if (!element.textContent || element.textContent.trim().length === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findEditableDescendant(element) {
    if (!element?.querySelectorAll) return null;
    return [...element.querySelectorAll("*")].find((candidate) => canEdit(candidate) && !isPreviewChrome(candidate)) || null;
  }

  function isPreviewChrome(element) {
    if (!element?.closest) return false;
    const navigation = element.closest("nav, [role='navigation']");
    if (navigation) {
      const navigationLabel = `${navigation.getAttribute("aria-label") || ""} ${navigation.textContent || ""}`.toLowerCase();
      if (/slide|deck|chapter|presentation/.test(navigationLabel)) return true;
    }
    const labeledControl = element.closest("[aria-label]");
    const label = labeledControl?.getAttribute("aria-label")?.toLowerCase() || "";
    return /(?:copy link to|previous|next|open|go to).*(?:slide|chapter)|(?:slide|chapter).*(?:navigation|picker|menu)/.test(label);
  }

  function beginEditing(element) {
    const before = element.textContent;
    const anchor = createAnchor(
      element,
      element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2,
      element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2,
    );
    activeEdit = {
      before,
      element,
      pending: false,
      previous: {
        ariaLabel: element.getAttribute("aria-label"),
        caretColor: element.style.caretColor,
        contenteditable: element.getAttribute("contenteditable"),
        outline: element.style.outline,
        outlineOffset: element.style.outlineOffset,
        role: element.getAttribute("role"),
        spellcheck: element.getAttribute("spellcheck"),
        tabindex: element.getAttribute("tabindex"),
      },
    };
    element.setAttribute("contenteditable", "plaintext-only");
    element.setAttribute("role", "textbox");
    element.setAttribute("aria-label", `Edit ${anchor.label}`);
    element.setAttribute("tabindex", "0");
    element.setAttribute("spellcheck", "true");
    element.style.outline = "2px solid #79ad91";
    element.style.outlineOffset = "4px";
    element.style.caretColor = "#5f9877";
    element.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    hideBox(hoverBox);
    post("edit-start", { anchor, before });
  }

  function requestEditCommit() {
    if (!activeEdit || activeEdit.pending) return;
    activeEdit.pending = true;
    post("edit-commit", { value: activeEdit.element.textContent });
  }

  function finishSavedEdit() {
    if (!activeEdit) return;
    restoreEditableElement(activeEdit);
    activeEdit = null;
  }

  function cancelEditing(notifyHost = true) {
    if (!activeEdit) return;
    activeEdit.element.textContent = activeEdit.before;
    restoreEditableElement(activeEdit);
    activeEdit = null;
    if (notifyHost) post("edit-cancelled");
  }

  function restoreEditableElement(edit) {
    const { element, previous } = edit;
    if (previous.contenteditable === null) element.removeAttribute("contenteditable");
    else element.setAttribute("contenteditable", previous.contenteditable);
    if (previous.spellcheck === null) element.removeAttribute("spellcheck");
    else element.setAttribute("spellcheck", previous.spellcheck);
    if (previous.role === null) element.removeAttribute("role");
    else element.setAttribute("role", previous.role);
    if (previous.ariaLabel === null) element.removeAttribute("aria-label");
    else element.setAttribute("aria-label", previous.ariaLabel);
    if (previous.tabindex === null) element.removeAttribute("tabindex");
    else element.setAttribute("tabindex", previous.tabindex);
    element.style.outline = previous.outline;
    element.style.outlineOffset = previous.outlineOffset;
    element.style.caretColor = previous.caretColor;
    element.blur();
  }

  function handleKeydown(event) {
    if (!activeEdit) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelEditing();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      requestEditCommit();
    } else if (EDIT_NAVIGATION_KEYS.has(event.key)) {
      event.stopImmediatePropagation();
    }
  }

  function handleBeforeInput(event) {
    if (!activeEdit || !activeEdit.element.contains(event.target)) return;
    if (String(event.inputType).startsWith("format") || event.inputType === "insertFromDrop") {
      event.preventDefault();
    }
  }

  function handleInput(event) {
    if (!activeEdit || !activeEdit.element.contains(event.target)) return;
    activeEdit.pending = false;
    post("edit-change", { value: activeEdit.element.textContent });
  }

  function handlePaste(event) {
    if (!activeEdit || !activeEdit.element.contains(event.target)) return;
    event.preventDefault();
    insertPlainText(event.clipboardData?.getData("text/plain") || "");
  }

  function insertPlainText(text) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    activeEdit.pending = false;
    post("edit-change", { value: activeEdit.element.textContent });
  }

  function createAnchor(element, clientX, clientY) {
    const rect = element.getBoundingClientRect();
    const ownText = normalizedText([...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")).slice(0, 300);
    const text = normalizedText(element.textContent).slice(0, 500);
    return {
      html: String(element.outerHTML || "").slice(0, 2_000),
      label: semanticLabel(element),
      location: `${location.pathname}${location.search}${location.hash}`,
      ownText,
      point: {
        x: clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1),
        y: clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1),
      },
      selector: uniqueSelector(element),
      tagName: element.tagName.toLowerCase(),
      text,
    };
  }

  function selectAnchor(anchor) {
    const element = resolveAnchor(anchor);
    if (!element) return;
    selectedTarget = element;
    drawBox(selectedBox, element, semanticLabel(element), false);
  }

  function startEditCandidate(selector) {
    if (activeEdit || mode !== "edit" || !selector) return;
    let element;
    try {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) element = matches[0];
    } catch {
      return;
    }
    if (element && canEdit(element) && !isPreviewChrome(element)) beginEditing(element);
  }

  function applyVisibleText(from, to) {
    if (typeof from !== "string" || typeof to !== "string") return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let element = walker.currentNode;
    while (element) {
      if (canEdit(element) && element.textContent === from) element.textContent = to;
      element = walker.nextNode();
    }
    scheduleReconcile();
  }

  function uniqueSelector(element) {
    if (element.id) {
      const candidate = `#${cssEscape(element.id)}`;
      if (isUnique(candidate, element)) return candidate;
    }

    for (const attribute of ["data-testid", "data-id", "aria-label", "name"]) {
      const value = element.getAttribute(attribute);
      if (!value || value.length > 100) continue;
      const candidate = `${element.tagName.toLowerCase()}[${attribute}="${cssEscapeAttribute(value)}"]`;
      if (isUnique(candidate, element)) return candidate;
    }

    const meaningfulClasses = [...element.classList]
      .filter((name) => name.length > 1 && !/^(_|css-|jsx-|sc-|[a-z0-9]{8,})$/i.test(name))
      .slice(0, 2);
    if (meaningfulClasses.length) {
      const candidate = `${element.tagName.toLowerCase()}${meaningfulClasses.map((name) => `.${cssEscape(name)}`).join("")}`;
      if (isUnique(candidate, element)) return candidate;
    }

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      let part = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (isUnique(candidate, element)) return candidate;
      current = current.parentElement;
    }
    return parts.join(" > ") || "body";
  }

  function isUnique(selector, element) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  }

  function resolveAnchor(anchor) {
    if (!anchor?.selector) return null;
    let matches;
    try {
      matches = document.querySelectorAll(anchor.selector);
    } catch {
      return null;
    }
    if (matches.length !== 1) return null;
    const element = matches[0];
    if (anchor.text && normalizedText(element.textContent).slice(0, 500) !== anchor.text) return null;
    return element;
  }

  function semanticLabel(element) {
    const tag = element.tagName.toLowerCase();
    const aria = element.getAttribute("aria-label");
    if (aria) return `${tag} “${normalizedText(aria).slice(0, 60)}”`;
    const role = element.getAttribute("role");
    if (role) return `${tag} [${role}]`;
    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ");
    const conciseText = normalizedText(ownText || element.textContent).slice(0, 60);
    if (conciseText) return `${tag} “${conciseText}${conciseText.length === 60 ? "…" : ""}”`;
    const meaningfulClass = [...element.classList].find((name) => name.length > 1 && name.length < 50);
    return meaningfulClass ? `${tag}.${meaningfulClass}` : tag;
  }

  function setMarkers(annotations) {
    markerRecords = Array.isArray(annotations) ? annotations.slice(0, MARKER_LIMIT) : [];
    markersLayer.replaceChildren();
    for (const record of markerRecords) {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "marker";
      marker.dataset.id = record.id;
      marker.setAttribute("aria-label", `Review note ${record.number}`);
      const number = document.createElement("span");
      number.textContent = String(record.number);
      marker.append(number);
      marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        post("marker-click", { id: record.id });
      });
      markersLayer.append(marker);
    }
    reconcileMarkers();
  }

  function reconcileMarkers() {
    const markers = [...markersLayer.children];
    for (let index = 0; index < markerRecords.length; index += 1) {
      const record = markerRecords[index];
      const marker = markers[index];
      const element = resolveAnchor(record.anchor);
      if (!element) {
        marker.style.display = "none";
        continue;
      }
      const rect = element.getBoundingClientRect();
      const point = record.anchor.point || { x: 0.5, y: 0.5 };
      marker.style.display = "grid";
      marker.style.left = `${rect.left + rect.width * clamp(point.x, 0, 1)}px`;
      marker.style.top = `${rect.top + rect.height * clamp(point.y, 0, 1)}px`;
    }
    if (hoverTarget) drawBox(hoverBox, hoverTarget, semanticLabel(hoverTarget), mode === "edit" && canEdit(hoverTarget));
    if (selectedTarget) drawBox(selectedBox, selectedTarget, semanticLabel(selectedTarget), false);
  }

  function focusMarker(id) {
    const index = markerRecords.findIndex((record) => record.id === id);
    if (index === -1) return;
    const element = resolveAnchor(markerRecords[index].anchor);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    window.setTimeout(() => {
      reconcileMarkers();
      const marker = [...markersLayer.children][index];
      marker?.classList.add("pulse");
      window.setTimeout(() => marker?.classList.remove("pulse"), 750);
    }, 320);
  }

  function scheduleReconcile() {
    if (reconcileQueued) return;
    reconcileQueued = true;
    requestAnimationFrame(() => {
      reconcileQueued = false;
      reconcileMarkers();
    });
  }

  function drawBox(box, element, label, editable) {
    if (!element?.isConnected) return hideBox(box);
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return hideBox(box);
    box.style.display = "block";
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.classList.toggle("editable", Boolean(editable));
    const labelNode = box === hoverBox ? hoverLabel : selectedLabel;
    labelNode.textContent = label;
    if (rect.top < 28) {
      labelNode.style.top = "auto";
      labelNode.style.bottom = "-25px";
    } else {
      labelNode.style.top = "-25px";
      labelNode.style.bottom = "auto";
    }
  }

  function hideBox(box) {
    box.style.display = "none";
  }

  function plainRect(rect) {
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    };
  }

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function cssEscapeAttribute(value) {
    return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function post(type, payload = {}) {
    window.parent.postMessage({ ...payload, source: SOURCE, session, type }, "*");
  }

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
})();
