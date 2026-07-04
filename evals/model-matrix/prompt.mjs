import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const TASK_CARD = {
  'arch-diagram': 'web-diagram.md',
  'code-walkthrough': 'code-walkthrough.md',
  'comparison-table': 'comparison-table.md',
  'explain-diff': 'explain-diff.md',
};

const encoder = new TextEncoder();

export async function buildPrompt({ task, repoRoot = process.cwd(), warn = console.warn } = {}) {
  if (!task) throw new Error('buildPrompt requires a task slug');
  const taskPath = path.join(repoRoot, 'evals/model-matrix/tasks', `${task}.md`);
  const skillPath = path.join(repoRoot, 'plugins/visual-explainer/SKILL.md');
  const cardsDir = path.join(repoRoot, 'plugins/visual-explainer/cards');
  const cardName = TASK_CARD[task];
  const taskBrief = await fs.readFile(taskPath, 'utf8');
  const skill = await fs.readFile(skillPath, 'utf8');
  const sections = [
    header('VISUAL EXPLAINER SKILL', skill),
  ];
  let cardPath = null;
  let card = null;
  let cardWarning = null;

  if (cardName) {
    cardPath = path.join(cardsDir, cardName);
    try {
      card = await fs.readFile(cardPath, 'utf8');
      sections.push(header(`USE-CASE CARD: ${cardName}`, card));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      cardWarning = `Warning: missing visual-explainer card ${path.relative(repoRoot, cardPath)}; falling back to SKILL.md only.`;
      warn(cardWarning);
    }
  }

  sections.push(header(`TASK BRIEF: ${task}`, taskBrief));
  sections.push(`OUTPUT CONTRACT
Reply with ONLY the complete MDX (or TSX) source file content for this explainer, no fences, no commentary. Import shared components from 'visual-explainer-mdx/components.tsx' exactly as the docs show. Do not include reasoning or commentary; output the file content only.`);

  const prompt = `${sections.join('\n\n')}\n`;
  const bytes = encoder.encode(prompt);
  return {
    prompt,
    sha256: crypto.createHash('sha256').update(prompt).digest('hex'),
    bytes: bytes.byteLength,
    chars: prompt.length,
    approxTokens: Math.ceil(prompt.length / 4),
    paths: {
      skill: path.relative(repoRoot, skillPath),
      card: card ? path.relative(repoRoot, cardPath) : null,
      task: path.relative(repoRoot, taskPath),
    },
    warning: cardWarning,
  };
}

export function taskCardName(task) {
  return TASK_CARD[task] || null;
}

function header(title, body) {
  return `===== ${title} =====\n${body.trimEnd()}`;
}
