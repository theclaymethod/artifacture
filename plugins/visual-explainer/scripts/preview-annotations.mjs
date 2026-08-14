function normalizeHash(hash) {
  if (!hash || hash === "#") return "";
  return hash.startsWith("#") ? hash : `#${hash}`;
}

function locationHash(location) {
  const index = String(location || "").indexOf("#");
  return index === -1 ? "" : normalizeHash(String(location).slice(index));
}

export function annotationsForFrame(annotations, frameHash) {
  const activeHash = normalizeHash(frameHash);
  return (Array.isArray(annotations) ? annotations : []).filter((annotation) => {
    const annotationLocation = annotation?.anchor?.location;
    if (!annotationLocation) return true;
    return locationHash(annotationLocation) === activeHash;
  });
}
