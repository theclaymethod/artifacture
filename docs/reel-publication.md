# Package the completed showcase

The scene-authoring and capture guidance landed in PR #30. The completed
HyperFrames reel is a separate publication artifact: 92 seconds at 1920×1080,
30 fps, with the original Function Intelligence singularity at 69–92 seconds.

The editable reel depends on source captures in the sibling Clarity and Rocket
projects. Committing its HTML alone does not preserve the film. Use the packager
against the checkout containing all three completed projects:

```sh
python3 scripts/package-reel.py build \
  --source /path/to/completed/artifacture \
  --output /path/outside/the/checkout/singularity-overdrive
```

Use Python 3.12 or newer. Output must be new; the command never overwrites an
existing package. It creates a directory, a `.tar.gz` archive, and an archive
SHA-256 sidecar. The archive deduplicates identical files with hard links while
retaining their original paths. The restore command separates those links into
independent editable files after checking the archive checksum.

The package preserves:

- The committed repository baseline needed by the local `artifacture/vite`
  dependency, with the six completed guidance files overlaid.
- `examples/clarity`, `examples/rocket-film`, and `examples/hyperframes-showcase`,
  including ignored media, both renders, prepared assets, capture manifests,
  native source, built pages, storyboards, verification evidence and notices.
- Additional notices from the installed Hairline, Anatomy and GSAP packages.
- A static `watch.html` player, a portable README, the verification command,
  and a per-file size/SHA-256 manifest.

Installed dependencies, Rust targets, Python environments, browser previews and
thumbnail/waveform caches are excluded and listed in the manifest. Lockfiles
remain. Source symlinks, private environment/key files, and Poppy-named paths
cause packaging to stop for review. Only the committed baseline and explicitly
listed project/guidance paths are copied; unrelated dirty checkout files are
never swept into the bundle. The command does not change source files, stop
servers, publish remotely, or delete anything.

## Verify an extracted archive

```sh
shasum -a 256 -c singularity-overdrive.tar.gz.sha256
python3 scripts/package-reel.py restore singularity-overdrive.tar.gz --output restored
cd restored/singularity-overdrive
python3 package-reel.py verify .
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/watch.html`. Verify the archive before installing
dependencies: installation adds files not present in the preservation manifest.
Use the restore command before editing; ordinary tar extraction retains shared
hard links between identical assets.

For an editable preview, enter `source/examples/hyperframes-showcase`, run
`npm ci`, then `npm run dev -- --background`. Prepared assets are already present.
`npm run prepare:media` regenerates them from the included captures using FFmpeg
and ffprobe. The original HyperFrames 0.8.150 pin is retained; an upgrade should
be reviewed as its own change. Restoring dependencies requires network access;
watching the MP4 does not.

To rebuild the original WebGPU capture site, run `npm ci` in `source/`, then
`npm ci` and `npm run build` in `source/examples/clarity/web`. Its local
`artifacture/vite` link resolves imports from the repository root, so both
dependency installs are required. The HyperFrames edit itself needs only its
own dependency install and the bundled prepared media.

## Publish

The final MP4 can be uploaded directly. For a static web player, upload
`watch.html` and retain its relative path to
`source/examples/hyperframes-showcase/renders/singularity-overdrive.mp4`.
Also copy the linked `NOTE.md` and `RETRO.md` into that same project directory.
Keep the full source archive and its checksum alongside the publication, even
when only the MP4 is public. Upstream license and attribution files remain with
their sources; packaging does not relicense them.

This is a showcase, not a narrated physics lesson. Existing production notes
record the remaining pacing weakness in the code beat and the inconclusive
nested-scene DOM lint. The recorded frame scan screens for whole-frame flashes;
it does not certify the absence of every localized flicker.

## Verified package, October 17, 2026

- Archive: `singularity-overdrive-2026-10-17-release.tar.gz`
- Size: 1,428,377,503 bytes; 3,576 preserved files, totaling 2,425,407,577 bytes
  before archive deduplication/compression.
- SHA-256: `d5d870a5ebe7259aa90a07d3adb48e3e5e6e4ee203fac361d478a94f230eeba9`
- Source baseline: `3ccc488e8c5139166301ce6212a5d2a45dff9d48`, plus the
  explicitly copied completed projects and guidance. Guidance is merged in
  [PR #30](https://github.com/theclaymethod/artifacture/pull/30).

Verified every final archive member, including hard-link targets, against its
manifest. A restore exercised checksum verification and separation of linked
copies; a deliberately changed README was rejected. In the restored projects,
all eleven video assets regenerated, the original capture site's TypeScript
check and Vite build passed, and HyperFrames reported no lint/runtime/layout/
motion findings. That HyperFrames run performed zero contrast checks; it is not
a contrast audit. The final 2,760-frame H.264/AAC movie decoded without errors.

The source directories and their live servers remain intact. This receipt
records a local publication package, not an uploaded release. Dependency caches
can be restored from lockfiles; native GPU recapture and Rust/Manim re-rendering
were not repeated for packaging.
