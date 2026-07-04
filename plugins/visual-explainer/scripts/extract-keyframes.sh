#!/usr/bin/env bash
# extract-keyframes.sh
# Extract 3 keyframes (start / middle / end) from an MP4 or WebM.
# Used after a --quality draft render so the skill can show the user three
# still frames before committing to a final --quality standard render.
#
# Usage:
#   extract-keyframes.sh <input.mp4> [output-dir]
#
# Defaults:
#   output-dir = same directory as input, subfolder `keyframes/`
#
# Emits:
#   <output-dir>/<basename>-01-start.png
#   <output-dir>/<basename>-02-mid.png
#   <output-dir>/<basename>-03-end.png

set -eu

if [ $# -lt 1 ]; then
  printf "Usage: extract-keyframes.sh <input.mp4> [output-dir]\n" >&2
  exit 2
fi

INPUT="$1"

if [ ! -f "${INPUT}" ]; then
  printf "Error: input file not found: %s\n" "${INPUT}" >&2
  exit 2
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  printf "Error: ffmpeg not found on PATH. Install ffmpeg to extract keyframes.\n" >&2
  exit 2
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  printf "Error: ffprobe not found on PATH. It ships with ffmpeg.\n" >&2
  exit 2
fi

BASENAME=$(basename "${INPUT}")
STEM="${BASENAME%.*}"
INPUT_DIR=$(cd "$(dirname "${INPUT}")" && pwd)

OUTPUT_DIR="${2:-${INPUT_DIR}/keyframes}"
mkdir -p "${OUTPUT_DIR}"

# Get duration in seconds (float).
DUR=$(ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "${INPUT}")

if [ -z "${DUR}" ]; then
  printf "Error: could not read duration from %s\n" "${INPUT}" >&2
  exit 2
fi

# Compute timestamps. Start at 0.5s in (skip opening black frame); end 0.5s before the end.
START_T=0.5
MID_T=$(awk -v d="${DUR}" 'BEGIN { printf "%.3f", d / 2 }')
END_T=$(awk -v d="${DUR}" 'BEGIN { printf "%.3f", (d - 0.5 > 0) ? d - 0.5 : d }')

extract_frame() {
  local ts="$1"
  local label="$2"
  local out="${OUTPUT_DIR}/${STEM}-${label}.png"

  ffmpeg -y -loglevel error -ss "${ts}" -i "${INPUT}" -frames:v 1 -q:v 2 "${out}"
  printf "  %s  (t=%s)\n" "${out}" "${ts}"
}

printf "Extracting 3 keyframes from %s (duration %ss):\n" "${INPUT}" "${DUR}"
extract_frame "${START_T}" "01-start"
extract_frame "${MID_T}"   "02-mid"
extract_frame "${END_T}"   "03-end"

printf "Done. Keyframes in %s\n" "${OUTPUT_DIR}"
