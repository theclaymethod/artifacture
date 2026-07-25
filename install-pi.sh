#!/bin/bash
# install-pi.sh - Install Artifacture's visual-explainer skill for Pi

set -e

SKILL_DIR="$HOME/.pi/agent/skills/visual-explainer"
PI_SKILLS_DIR="$HOME/.pi/agent/skills"
PROMPTS_DIR="$HOME/.pi/agent/prompts"

# Check if we're in the repo or need to clone
if [ ! -f "plugins/visual-explainer/SKILL.md" ]; then
    echo "Cloning Artifacture..."
    TEMP_DIR=$(mktemp -d)
    git clone --depth 1 https://github.com/theclaymethod/artifacture.git "$TEMP_DIR"
    cd "$TEMP_DIR"
    CLEANUP=true
else
    CLEANUP=false
fi

# Copy skill
echo "Installing skill to $SKILL_DIR..."
rm -rf "$SKILL_DIR"
cp -r plugins/visual-explainer "$SKILL_DIR"

# Replace {{skill_dir}} with actual path
echo "Patching paths..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    find "$SKILL_DIR" -name "*.md" -exec sed -i '' "s|{{skill_dir}}|$SKILL_DIR|g" {} \;
else
    find "$SKILL_DIR" -name "*.md" -exec sed -i "s|{{skill_dir}}|$SKILL_DIR|g" {} \;
fi

# Copy prompts (slash commands)
echo "Installing prompts to $PROMPTS_DIR..."
mkdir -p "$PROMPTS_DIR"
cp "$SKILL_DIR/commands/"*.md "$PROMPTS_DIR/"

# Cleanup if we cloned
if [ "$CLEANUP" = true ]; then
    rm -rf "$TEMP_DIR"
fi

echo ""
echo "Artifacture core installed. Restart Pi to use visual-explainer."
echo ""
echo "Companion skill family:"
if [ -d "$PI_SKILLS_DIR/impeccable" ]; then
    echo "  [found] Impeccable — general visual craft"
else
    echo "  [missing] Impeccable — install separately for general visual craft"
fi
if [ -d "$PI_SKILLS_DIR/unslop" ]; then
    echo "  [found] Unslop — prose review"
else
    echo "  [missing] Unslop — install separately for prose review"
fi
echo "  Missing companions are reported as skipped; Artifacture does not copy their rubrics."
echo "  Visual screenshot passes also require an eval-qualified model policy."
echo "  See: https://github.com/theclaymethod/artifacture/blob/main/docs/installation.md"
echo ""
echo "Commands available:"
echo "  /diff-review, /plan-review, /project-recap, /fact-check"
echo "  /generate-web-diagram, /generate-slides, /generate-visual-plan"
echo "  /share"
