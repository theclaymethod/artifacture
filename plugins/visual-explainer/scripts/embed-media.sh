#!/usr/bin/env bash
# Emit a self-contained HTML snippet with base64-inlined media.
#
# Usage:
#   embed-media.sh <media-file> [alt-text]
#
# Supported: png, jpg/jpeg, gif, webp, webm, mp4
#
# Produces on stdout:
#   - <img>   for raster image formats
#   - <video> for webm/mp4 (autoplay, loop, muted, playsinline)
#
# Warns on stderr if the file exceeds 2MB (base64 inflation pushes the
# data URI past the point where inline embedding stays snappy).

set -euo pipefail

FILE="${1:?usage: embed-media.sh <media-file> [alt-text]}"
ALT="${2:-}"

if [[ ! -f "$FILE" ]]; then
  echo "error: file not found: $FILE" >&2
  exit 1
fi

EXT="${FILE##*.}"
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

case "$EXT_LOWER" in
  png)        MIME="image/png";  KIND="img"   ;;
  jpg|jpeg)   MIME="image/jpeg"; KIND="img"   ;;
  gif)        MIME="image/gif";  KIND="img"   ;;
  webp)       MIME="image/webp"; KIND="img"   ;;
  webm)       MIME="video/webm"; KIND="video" ;;
  mp4)        MIME="video/mp4";  KIND="video" ;;
  *)
    echo "error: unsupported extension .$EXT" >&2
    exit 1
    ;;
esac

SIZE=$(wc -c < "$FILE" | tr -d ' ')
SIZE_KB=$((SIZE / 1024))

if [[ "$SIZE" -gt 2097152 ]]; then
  echo "warning: $FILE is ${SIZE_KB}KB — base64 inflation (~33%) will push the HTML past 2.7MB." >&2
  echo "         consider re-encoding at lower fps/resolution before inlining." >&2
fi

if [[ "$(uname)" == "Darwin" ]]; then
  DATA=$(base64 -i "$FILE")
else
  DATA=$(base64 -w 0 "$FILE")
fi

if [[ "$KIND" == "img" ]]; then
  cat <<HTML
<img src="data:$MIME;base64,$DATA"
     alt="$ALT"
     style="width:100%;max-width:1200px;display:block;margin:0 auto;border-radius:8px;">
HTML
else
  cat <<HTML
<video autoplay loop muted playsinline preload="auto"
       style="width:100%;max-width:1200px;display:block;margin:0 auto;border-radius:8px;">
  <source src="data:$MIME;base64,$DATA" type="$MIME">
</video>
HTML
fi

echo "embedded $FILE (${SIZE_KB}KB → data:$MIME)" >&2
