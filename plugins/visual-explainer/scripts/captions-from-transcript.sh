#!/usr/bin/env bash
# Emit caption HTML from a hyperframes transcript.json.
#
# Groups word-level timings into sentences at .!? boundaries and prints one
# <div class="cap cap-N" data-start="..." data-duration="...">TEXT</div>
# per sentence, with TEXT taken verbatim from the narration.
#
# Captions must mirror the narration word-for-word. Paraphrasing creates
# read/hear drift that kills reel comprehension in silent-autoplay feeds.
# Use this script so the caption copy is a pure byproduct of the transcript.
#
# Usage:
#   captions-from-transcript.sh <transcript.json> [class-name]
#
#   transcript.json   Output of `npx hyperframes transcribe narration.wav`
#   class-name        CSS class for each <div>; default "cap"
#
# Example:
#   captions-from-transcript.sh transcript.json > captions.html

set -euo pipefail

IN="${1:?usage: captions-from-transcript.sh <transcript.json> [class]}"
CLS="${2:-cap}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 required for JSON parsing" >&2
  exit 1
fi
if [[ ! -f "$IN" ]]; then
  echo "error: transcript file not found: $IN" >&2
  exit 1
fi

python3 - "$IN" "$CLS" <<'PY'
import json, re, sys, html

path, cls = sys.argv[1], sys.argv[2]

with open(path, "r", encoding="utf-8") as f:
    words = json.load(f)

if not isinstance(words, list) or not words:
    print(f"error: {path} is empty or not a word-list transcript", file=sys.stderr)
    sys.exit(1)

sentences = []
cur = []
for w in words:
    cur.append(w)
    if re.search(r"[.!?]", w["text"]):
        sentences.append(cur)
        cur = []
if cur:
    sentences.append(cur)

for i, sent in enumerate(sentences, 1):
    start = sent[0]["start"]
    end = sent[-1]["end"]
    dur = end - start
    text = " ".join(w["text"] for w in sent).strip()
    text_html = html.escape(text)
    print(f'  <div class="{cls} {cls}-{i}" '
          f'data-start="{start:.2f}" data-duration="{dur:.2f}">'
          f'{text_html}</div>')
PY
