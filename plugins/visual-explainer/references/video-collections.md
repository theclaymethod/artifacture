# Author videos as a collection

Use a collection when episodes share an audience, terminology, subjects, and a learning sequence. A collection manifest owns those facts. Editable episode TSX owns motion. Each episode answers one question and gives the next episode a useful starting point.

Choose the instructional mode by the viewer's task. Format controls canvas, duration, and frame rate. The engine controls rendering. These are independent choices. Print the canonical mode purposes, required fields, and review prompts with:

```bash
npm run ve:video-collection -- modes
```

The registry at `video/modes.mjs` owns the mode IDs and contracts. A review episode judges risk using a pinned change and observed validation. A nontechnical episode uses a familiar analogy, states its correspondence, and explains where it breaks. Do not change either into a generic recap.

Start with `examples/video-collections/source-to-video.json`. It contains two draft episodes with the same subjects and inspected Git evidence. Validate the manifest, then create a fresh authoring directory:

```bash
npm run ve:video-collection -- check <collection.json> --repo <source-repository>
npm run ve:video-collection -- scaffold <collection.json> --repo <source-repository> --out <new-directory>
```

Read `COLLECTION.md` and each episode's `SCRIPT.md`. Follow the session's script review or autonomous iteration preference before treating it as settled. Iterate on its question, causal mechanism, evidence or consequence, and handoff using [dynamic-video-authoring.md](dynamic-video-authoring.md). Each narration beat stays attached to claims and a scene. Compilation checks evidence bindings; it does not fact-check prose or approve a script.

For a draft's structure, use an immediate visible event, a viewer prediction, an observed result, one causal mechanism, and a usable rule. End with the next episode's curiosity when the series needs it. Ground observed results in supplied evidence. Adapt this sequence to the instructional mode and the material. The user-supplied [technical explainer field guide](https://muse.ai/s/top-technical-explainer-videos-jxh6bxv9t04xjb) is an authoring reference, not a source of validated performance measurements. See [the editable script iteration](../../../docs/video-script-iteration.md).

During script review, state each beat's purpose, visible entry state, and visible exit state or intended viewer understanding. Inspect actual frames and transition locations, then record and repair each defect locally. Each format variant needs its own composition for its reading conditions. The [video production references](../../../docs/video-production-references.md) connect this guidance to the supplied sources.

The generated composition uses `createDiagramScene`, `createSlideScene`, and `sequenceSlides`. It preserves canonical subject IDs and uses the shared graphics renderer. Export this source with the bundled runtime:

```bash
npm run ve:graphic-video -- <new-directory>/episodes/<id>/composition.tsx --out <video-project>/index.html
```

`ve:export-static` alone does not bundle the `GraphicVideo` browser runtime. Keep legacy handwritten timeline compositions on their existing static route.

Check the opening, every beat boundary, the complete explanatory state, and a repeated time after a backward seek. Review the same subjects and terms across adjacent episodes. Review narration and captions once real audio exists. Follow [verification.md](verification.md) before claiming a delivered video is complete.

The compiler emits silent motion starters, supplied narration drafts, expanded briefs, outlines, and review questions. It does not synthesize speech, encode movies, select a native engine, or certify a collection. The output is complete only when `collection.complete.json` exists. Existing output directories are refused. If copying fails, preserve the partial directory and choose a new path. Use one output directory per authoring attempt.

Read [the collection contract](../../../docs/video-collections.md) for the manifest fields, evidence rules, and limits.
