#!/usr/bin/env bash
# hyperframes-doctor.sh
# Verify Hyperframes runtime prerequisites before any video render.
#
# Exits 0 on success, 1 on any missing dependency. Prints install hints on
# failure so the caller can forward them to the user.

set -u

FAIL=0

printf "Hyperframes doctor — runtime check\n"
printf "%s\n" "----------------------------------"

# 1. Node >= 22
if ! command -v node >/dev/null 2>&1; then
  printf "  [FAIL] node not found on PATH\n"
  printf "         Install Node.js >= 22: https://nodejs.org\n"
  FAIL=1
else
  NODE_MAJOR=$(node -p 'parseInt(process.versions.node.split(".")[0], 10)' 2>/dev/null || echo 0)
  NODE_FULL=$(node -p 'process.versions.node' 2>/dev/null || echo "unknown")
  if [ "${NODE_MAJOR}" -lt 22 ]; then
    printf "  [FAIL] node %s found; Hyperframes requires >= 22\n" "${NODE_FULL}"
    printf "         Upgrade Node.js: https://nodejs.org or use nvm/fnm/volta\n"
    FAIL=1
  else
    printf "  [ ok ] node %s\n" "${NODE_FULL}"
  fi
fi

# 2. npx
if ! command -v npx >/dev/null 2>&1; then
  printf "  [FAIL] npx not found on PATH (should ship with Node)\n"
  FAIL=1
else
  printf "  [ ok ] npx\n"
fi

# 3. ffmpeg
if ! command -v ffmpeg >/dev/null 2>&1; then
  printf "  [FAIL] ffmpeg not found on PATH\n"
  UNAME=$(uname -s)
  case "${UNAME}" in
    Darwin)  printf "         Install: brew install ffmpeg\n" ;;
    Linux)   printf "         Install: apt install ffmpeg  (or your distro's equivalent)\n" ;;
    *)       printf "         Install: https://ffmpeg.org/download.html\n" ;;
  esac
  FAIL=1
else
  FFMPEG_VER=$(ffmpeg -version 2>/dev/null | head -n1 | awk '{print $3}')
  printf "  [ ok ] ffmpeg %s\n" "${FFMPEG_VER:-installed}"
fi

# 4. Hyperframes itself — delegate to upstream doctor if we have the prereqs
if [ "${FAIL}" -eq 0 ]; then
  printf "\nRunning 'npx hyperframes doctor' (first invocation may download Chrome)...\n"
  if ! npx --yes hyperframes doctor; then
    printf "\n  [FAIL] 'npx hyperframes doctor' reported issues\n"
    printf "         Address the problems above, then re-run.\n"
    FAIL=1
  fi
fi

# 5. Upstream authoring skills (non-fatal — we have our own authoring as fallback).
# The video commands prefer the upstream `/hyperframes` + `/gsap` vocab when
# those skills are installed; otherwise they author directly from our refs.
skill_dirs=(
  "${HOME}/.claude/skills"
  "${HOME}/.claude/plugins/cache/heygen-com"
)

probe_skill() {
  local name="$1"
  for dir in "${skill_dirs[@]}"; do
    if [ -e "${dir}/${name}" ]; then
      return 0
    fi
  done
  return 1
}

MISSING_SKILLS=""
for skill in hyperframes hyperframes-cli gsap; do
  if probe_skill "${skill}"; then
    printf "  [ ok ] upstream skill: %s\n" "${skill}"
  else
    printf "  [warn] upstream skill not found: %s\n" "${skill}"
    MISSING_SKILLS="${MISSING_SKILLS} ${skill}"
  fi
done

if [ -n "${MISSING_SKILLS}" ]; then
  printf "\n  Upstream authoring skills unavailable:%s\n" "${MISSING_SKILLS}"
  printf "  Install them for the full vocab + preview loop:\n"
  printf "      npx skills add heygen-com/hyperframes\n"
  printf "  (Not fatal — video commands fall back to our own authoring refs.)\n"
fi

printf "\n"
if [ "${FAIL}" -eq 0 ]; then
  printf "All checks passed. Ready to render.\n"
  exit 0
else
  printf "One or more checks failed. Video commands will not run until resolved.\n"
  exit 1
fi
