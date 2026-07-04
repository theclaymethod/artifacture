#!/usr/bin/env bash
# Stitch a directory of sequentially numbered PNG frames into a webm.
#
# Usage:
#   frames-to-webm.sh <frame-dir> <output.webm> [fps] [pattern]
#
#   frame-dir   Directory containing frames
#   output.webm Output path
#   fps         Frames per second (default: 2)
#   pattern     Printf-style pattern for frame filenames (default: frame-%03d.png)
#
# Example:
#   frames-to-webm.sh ~/.agent/diagrams/login-demo ~/.agent/diagrams/login-demo.webm 2

set -euo pipefail

FRAME_DIR="${1:?usage: frames-to-webm.sh <frame-dir> <output.webm> [fps] [pattern]}"
OUT="${2:?usage: frames-to-webm.sh <frame-dir> <output.webm> [fps] [pattern]}"
FPS="${3:-2}"
PATTERN="${4:-frame-%03d.png}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not installed. run: brew install ffmpeg" >&2
  exit 1
fi

if [[ ! -d "$FRAME_DIR" ]]; then
  echo "error: frame directory not found: $FRAME_DIR" >&2
  exit 1
fi

COUNT=$(find "$FRAME_DIR" -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')
if [[ "$COUNT" -eq 0 ]]; then
  echo "error: no .png frames in $FRAME_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

# VP9: strong compression for UI captures (large flat regions).
# -cpu-used 2 trades a little quality for ~3x encode speed.
# scale caps width at 1200 to keep inline base64 size reasonable.
ffmpeg -y -loglevel error \
  -framerate "$FPS" \
  -i "$FRAME_DIR/$PATTERN" \
  -c:v libvpx-vp9 \
  -crf 32 -b:v 0 \
  -cpu-used 2 \
  -row-mt 1 \
  -pix_fmt yuv420p \
  -vf "scale='min(1200,iw)':-2:flags=lanczos" \
  "$OUT"

SIZE=$(wc -c < "$OUT" | tr -d ' ')
SIZE_KB=$((SIZE / 1024))
echo "wrote $OUT (${SIZE_KB}KB, $COUNT frames @ ${FPS}fps)" >&2
