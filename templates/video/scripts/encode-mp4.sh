#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRAMES_DIR="$ROOT_DIR/out/frames"
OUT_MP4="$ROOT_DIR/out/demo.mp4"

if [ ! -d "$FRAMES_DIR" ]; then
  echo "Missing $FRAMES_DIR. Run pnpm run render:dawn first." >&2
  exit 1
fi

ffmpeg -y \
  -framerate 10 \
  -i "$FRAMES_DIR/frame-%05d.png" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUT_MP4"

echo "Encoded $OUT_MP4"
