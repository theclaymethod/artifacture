import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const words = (text, start = 0, step = .3) => text.split(' ').map((word, i) => ({ text: word, start: start + i * step, end: start + i * step + .25 }));

test('narrated film tools', async t => {
  const server = await createServer({ root: ROOT, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false, ws: false } });
  try {
    const align = await import('../visual-explainer-mdx/narration-align.mjs');
    const framing = await server.ssrLoadModule('/visual-explainer-mdx/scene-framing.ts');
    const holds = await server.ssrLoadModule('/visual-explainer-mdx/end-holds.ts');
    const { createGraphicScene } = await server.ssrLoadModule('/visual-explainer-mdx/graphics-types.ts');
    const { defineGraphicMotion } = await server.ssrLoadModule('/visual-explainer-mdx/graphic-motion.ts');

    await t.test('a take read exactly, including words read aloud in parts, has no differences', () => {
      assert.deepEqual(align.compareTranscript('Its SKILL.md asked twenty-nine questions.', words('Its skill dot md asked 29 questions.'), { ignore: ['dot'] }), []);
    });

    await t.test('added, missing and changed words are reported', () => {
      const differences = align.compareTranscript('In the Matrix, a program loads.', words('And in the matrix, the program loads.'));
      assert.deepEqual(differences.map(d => d.kind).sort(), ['added', 'changed']);
      assert.deepEqual(align.compareTranscript('Then test it.', words('Then it.')), [{ kind: 'missing', script: 'test', heard: '' }]);
    });

    await t.test('a dropped word does not shift later lines', () => {
      const lines = [{ id: '01', text: 'Make a skill.' }, { id: '02', text: 'A skill is a living document.' }, { id: '03', text: 'Remove what stops helping.' }];
      const heard = [...words('Make a skill.', 0), ...words('skill is a living document.', 2), ...words('Remove what stops helping.', 5)];
      const [first, second, third] = align.alignScript(lines, heard);
      assert.equal(first.start, 0);
      assert.equal(second.words[0].alignment, 'interpolated');
      assert.equal(second.words[1].start, 2);
      assert.equal(third.start, 5);
      const cues = align.toAlignedWords(second);
      assert.ok(cues.every(([, start, end]) => end > start));
    });

    await t.test('framing keeps every visible object inside the view and below the reserved band', () => {
      const box = (id, x, y, opacity = 1) => ({ id, kind: 'illustration', primitives: [{ kind: 'rect', x, y, width: 100, height: 60, fill: 'background', stroke: 'illustration-ink', strokeRole: 'structure' }], state: { opacity, reveal: 1, highlight: false, x: 0, y: 0 } });
      const scene = createGraphicScene({ id: 'framing', title: 'Framing', description: 'Two boxes; the second arrives far to the right.', bounds: { x: -2000, y: -2000, width: 4000, height: 4000 }, objects: [box('a', 0, 0), box('b', 900, 300, 0)] });
      const motion = defineGraphicMotion(scene, { duration: 4, tracks: [{ target: 'b', property: 'opacity', start: 2, duration: .3, from: 0, to: 1, ease: 'smooth' }] });
      const keys = framing.frameScene(scene, motion, { reserveTop: .25 });
      for (const t of [0, 1.5, 2.2, 3, 4]) {
        const view = framing.sampleFrame(keys, t);
        const visible = t >= 2 ? [[0, 0], [900, 300]] : [[0, 0]];
        for (const [x, y] of visible) {
          assert.ok(x >= view.x && x + 100 <= view.x + view.width, `x in view at ${t}s`);
          assert.ok(y >= view.y + view.height * .25 && y + 60 <= view.y + view.height, `y below the band at ${t}s`);
        }
      }
      assert.ok(framing.widestFrame(keys).width >= framing.sampleFrame(keys, 0).width);
    });

    await t.test('late tracks and cues are reported with their remaining hold', () => {
      const scene = createGraphicScene({ id: 'holds', title: 'Holds', description: 'One box.', bounds: { x: 0, y: 0, width: 200, height: 200 }, objects: [{ id: 'a', kind: 'illustration', primitives: [{ kind: 'circle', x: 100, y: 100, radius: 20, fill: 'background', stroke: 'illustration-ink', strokeRole: 'structure' }] }] });
      const motion = defineGraphicMotion(scene, { duration: 3, tracks: [{ target: 'a', property: 'opacity', start: 2.6, duration: .2, from: 1, to: .5, ease: 'smooth' }] });
      const late = holds.inspectEndHolds(motion, { cues: [{ id: 'type', at: 2.5 }, { id: 'early', at: .5 }] });
      assert.deepEqual(late.map(v => [v.kind, v.target]), [['track', 'a'], ['cue', 'type']]);
      assert.deepEqual(holds.inspectEndHolds(motion, { slot: 4 }), []);
    });
  } finally { await server.close(); }

  await t.test('narration cut splits a recording in its pauses and times every beat', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 && 'ffmpeg is not installed' }, () => {
    const work = mkdtempSync(path.join(tmpdir(), 'narration-test-'));
    try {
      // Two tones separated by silence stand in for two spoken lines.
      const audio = path.join(work, 'joined.wav');
      assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo:d=0.6', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1', '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1,aformat=channel_layouts=stereo', '-ar', '48000', audio]).status, 0);
      writeFileSync(path.join(work, 'script.json'), JSON.stringify([{ id: '01', text: 'First line.' }, { id: '02', text: 'Second line.' }]));
      writeFileSync(path.join(work, 'words.json'), JSON.stringify([{ text: 'First', start: .1, end: .5 }, { text: 'line.', start: .5, end: .95 }, { text: 'Second', start: 1.65, end: 2.1 }, { text: 'line.', start: 2.1, end: 2.55 }]));
      const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts/narration.mjs'), 'cut', '--audio', audio, '--words', path.join(work, 'words.json'), '--script', path.join(work, 'script.json'), '--out', path.join(work, 'out.wav'), '--timing', path.join(work, 'timing.json'), '--hold', '0.5', '--audio-start', '0', '--end-hold', '0']);
      assert.equal(run.status, 0, run.stderr.toString());
      const report = JSON.parse(run.stdout.toString());
      assert.equal(report.cuts.length, 1);
      assert.ok(report.cuts[0].at > 1 && report.cuts[0].at < 1.6, 'the cut lands in the silence');
      assert.ok(report.worstCutDb <= -60);
      const timing = JSON.parse(readFileSync(path.join(work, 'timing.json'), 'utf8'));
      assert.equal(timing.beats[0].start, 0);
      assert.ok(Math.abs(timing.beats[1].start - (report.cuts[0].at + .5)) < .01, 'the second beat starts after the inserted hold');
      assert.ok(Math.abs(timing.duration - (2.6 + .5)) < .05);
    } finally { rmSync(work, { recursive: true, force: true }); }
  });
});
