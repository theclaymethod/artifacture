#!/usr/bin/env python3
"""Preserve the completed showcase and verify its portable publication bundle."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


PROJECTS = ("clarity", "rocket-film", "hyperframes-showcase")
GUIDANCE = (
    "plugins/visual-explainer/SKILL.md",
    "plugins/visual-explainer/references/animation-skills.md",
    "plugins/visual-explainer/references/video-capture-and-edit.md",
    "templates/custom-slides/WORKFLOW.md",
    "templates/fframes-explainer/WORKFLOW.md",
    "templates/pr-review/WORKFLOW.md",
)
EXCLUDED = {"node_modules", ".git", "target", ".venv", "venv", "__pycache__",
            ".thumbnails", ".waveform-cache", ".DS_Store"}
REEL = Path("source/examples/hyperframes-showcase")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def files(root):
    return sorted(path for path in root.rglob("*") if path.is_file())


def check_name(path):
    if "poppy" in str(path).lower():
        raise ValueError(f"Out-of-scope Poppy path: {path}")
    if any(part.startswith(".env") and part not in {".env.example", ".env.sample"}
           for part in path.parts) or path.suffix in {".pem", ".key"}:
        raise ValueError(f"Review private configuration before packaging: {path}")


def copy_source(source, destination, excluded):
    for directory, dirs, names in os.walk(source, followlinks=False):
        parent = Path(directory)
        for name in list(dirs):
            entry = parent / name
            if entry.is_symlink():
                raise ValueError(f"Resolve source symlink explicitly: {entry}")
            if name in EXCLUDED or name.startswith(".hyperframes"):
                excluded.append(str(entry.relative_to(source)))
                dirs.remove(name)
        for name in names:
            entry = parent / name
            relative = entry.relative_to(source)
            if name in EXCLUDED or name.endswith(".pyc"):
                excluded.append(str(relative))
                continue
            check_name(relative)
            if entry.is_symlink():
                raise ValueError(f"Resolve source symlink explicitly: {entry}")
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(entry, target)
            if digest(entry) != digest(target):
                raise ValueError(f"Source changed during copy: {entry}")


def verify(root):
    manifest = json.loads((root / "MANIFEST.json").read_text())
    expected = {item["path"]: item for item in manifest["files"]}
    actual = {str(path.relative_to(root)) for path in files(root)} - {"MANIFEST.json"}
    if actual != set(expected):
        raise ValueError(f"Inventory mismatch: missing={set(expected)-actual}, extra={actual-set(expected)}")
    for name, item in expected.items():
        path = root / name
        if Path(name).is_absolute() or ".." in Path(name).parts or path.is_symlink():
            raise ValueError(f"Invalid manifest path: {name}")
        if path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
            raise ValueError(f"Checksum mismatch: {name}")
    print(f"Verified {len(expected)} files ({sum(item['bytes'] for item in expected.values())} bytes)", flush=True)


def package(source, output):
    archive_path = output.with_name(output.name + ".tar.gz")
    if output.exists() or archive_path.exists() or archive_path.with_name(archive_path.name + ".sha256").exists():
        raise ValueError("Choose a new output path; existing packages are never overwritten")
    if source == output or source in output.parents:
        raise ValueError("Output must be outside the source checkout")
    for name in PROJECTS:
        if not (source / "examples" / name).is_dir():
            raise ValueError(f"Missing source project: {name}")
    commit = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    output.mkdir(parents=True)
    base = output / "source"
    base.mkdir()
    # A committed baseline preserves the local artifacture/vite dependency without
    # copying unrelated working-tree changes or any Git credentials/history.
    with tempfile.TemporaryFile() as stream:
        subprocess.run(["git", "-C", str(source), "archive", commit], stdout=stream, check=True)
        stream.seek(0)
        with tarfile.open(fileobj=stream) as archive:
            for member in archive.getmembers():
                check_name(Path(member.name))
                if not (member.isfile() or member.isdir()):
                    raise ValueError(f"Unsupported baseline entry: {member.name}")
            archive.extractall(base, filter="data")
    excluded = {}
    for name in PROJECTS:
        exclusions = []
        copy_source(source / "examples" / name, base / "examples" / name, exclusions)
        excluded[name] = sorted(exclusions)
        print(f"Preserved {name}", flush=True)
    for name in GUIDANCE:
        target = base / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / name, target)
    notices = output / "dependency-notices"
    notices.mkdir()
    for name, origin in {
        "hairline-LICENSE": "examples/clarity/web/node_modules/@lucasmarkes/hairline/LICENSE",
        "anatomy-LICENSE": "examples/clarity/web/node_modules/anatomy-figures/LICENSE",
        "gsap-package.json": "examples/hyperframes-showcase/node_modules/gsap/package.json",
        "gsap-README.md": "examples/hyperframes-showcase/node_modules/gsap/README.md",
    }.items():
        shutil.copy2(source / origin, notices / name)
    shutil.copy2(Path(__file__), output / "package-reel.py")
    (output / "watch.html").write_text('''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Singularity overdrive</title>
<style>body{margin:0;background:#080c12;color:#fff;font:18px system-ui}main{max-width:1200px;margin:5vh auto;padding:24px}video{width:100%;background:#000}h1{font-weight:500}a{color:inherit}</style>
<main><h1>Singularity overdrive</h1>
<video controls playsinline preload="metadata" src="source/examples/hyperframes-showcase/renders/singularity-overdrive.mp4"></video>
<p><a href="source/examples/hyperframes-showcase/NOTE.md">Production notes</a> · <a href="source/examples/hyperframes-showcase/RETRO.md">Retrospective</a></p></main></html>
''')
    (output / "README.md").write_text(f'''# Singularity overdrive publication bundle

The completed 92-second, 1920×1080, 30 fps HyperFrames reel. Original singularity: 69–92 seconds.

Open `watch.html` to watch locally, or serve this directory with `python3 -m http.server 8080 --bind 127.0.0.1`.
The rendered MP4 can be published directly. To publish the static player, copy `watch.html` and its `source/examples/hyperframes-showcase/renders/singularity-overdrive.mp4` path to your host, plus NOTE.md and RETRO.md under that project directory. No build or CDN is needed for playback.

## Verify and edit

Run `python3 package-reel.py verify .` before publishing. It verifies every preserved file against MANIFEST.json, including source captures, fonts, audio, render, notices and evidence. Use Python 3.12 or newer. Restore an archive with `python3 package-reel.py restore /path/to/bundle.tar.gz --output /new/directory`; this verifies the files and separates archive hard links so editing one asset cannot change another copy.

For editing, enter `source/examples/hyperframes-showcase`, run `npm ci`, then `npm run dev -- --background`. The existing prepared assets are ready; `npm run prepare:media` is optional and rebuilds from the included sibling source captures using FFmpeg/ffprobe. `npm run check` validates the composition. `npm run render -- --quality delivery --fps 30 --output renders/new-edit.mp4` renders a new version. Node 22.12+ is required. HyperFrames remains pinned to 0.8.150 to preserve this delivered project; upgrading is a separate change.

`source/examples/clarity/web` contains the original WebGPU capture project; its local `artifacture/vite` dependency is preserved by the committed repository baseline ({commit}). To rebuild it, run `npm ci` in `source/` first, then `npm ci` and `npm run build` in `source/examples/clarity/web`. Both installs are required because Node resolves the linked Vite helper's imports from the repository root. GPU recapture requires a compatible browser/GPU. FFrames and Manim source projects are included for later editing; their Rust/Python toolchains are separate from playing or editing the HyperFrames reel. Live captures are preserved, not claimed to be deterministic.

## Preservation and scope

Includes the original 72-second render, the final 92-second render, prepared media, source captures/manifests, scores, native shader/model sources, fonts and licenses, built web pages where present, storyboards, verification output and retrospective. MANIFEST.json lists each file with SHA-256 and records excluded dependency/build-cache directories. Source directories and live servers were not changed. Unrelated dirty repository files are not copied. Poppy is outside this package's scope.

Existing provenance and third-party notices remain with their sources. Additional installed-package notices are in `dependency-notices/`; GSAP's package metadata links its standard license. This archive does not relicense upstream work.

Known review limits: the code beat needs tighter pacing; the upstream nested-scene DOM lint is inconclusive. The recorded whole-frame flicker scan does not rule out every localized artifact. See the production notes for measured results.
''')
    required = [REEL / "renders/singularity-overdrive.mp4", REEL / "renders/scenes-in-motion.mp4"]
    sources = json.loads((output / REEL / "assets/SOURCES.json").read_text())
    for item in sources:
        required += [REEL / "assets" / item["asset"], REEL / item["source"]]
    for path in required:
        if not (output / path).is_file():
            raise ValueError(f"Missing reel dependency: {path}")
    inventory = [{"path": str(path.relative_to(output)), "bytes": path.stat().st_size,
                  "sha256": digest(path)} for path in files(output)]
    write_json(output / "MANIFEST.json", {"schemaVersion": 1, "sourceCommit": commit,
               "projects": list(PROJECTS), "excluded": excluded, "files": inventory})
    verify(output)
    # Duplicate captures/public copies keep their paths via archive hard links.
    seen = {}
    with tarfile.open(archive_path, "w:gz", compresslevel=6) as archive:
        for path in files(output):
            key = (path.stat().st_size, digest(path))
            name = str(Path(output.name) / path.relative_to(output))
            info = archive.gettarinfo(str(path), arcname=name)
            if key in seen:
                info.type, info.linkname, info.size = tarfile.LNKTYPE, seen[key], 0
                archive.addfile(info)
            else:
                seen[key] = name
                with path.open("rb") as stream:
                    archive.addfile(info, stream)
    checksum = digest(archive_path)
    archive_path.with_name(archive_path.name + ".sha256").write_text(f"{checksum}  {archive_path.name}\n")
    print(json.dumps({"archive": str(archive_path), "sha256": checksum,
                      "bytes": archive_path.stat().st_size, "files": len(inventory)}, indent=2))


def restore(archive_path, output):
    if output.exists():
        raise ValueError("Restore requires a new directory")
    sidecar = archive_path.with_name(archive_path.name + ".sha256")
    expected = sidecar.read_text().split()[0]
    if digest(archive_path) != expected:
        raise ValueError("Archive checksum mismatch")
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        roots = {Path(item.name).parts[0] for item in members}
        if len(roots) != 1:
            raise ValueError("Expected one package root")
        # The data filter rejects paths/links escaping the destination.
        archive.extractall(output, filter="data")
    root = output / roots.pop()
    verify(root)
    for path in files(root):
        if path.stat().st_nlink > 1:
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
                temporary = Path(stream.name)
            try:
                shutil.copy2(path, temporary)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
    verify(root)
    print(f"Restored independent editable files to {root}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    build.add_argument("--source", type=Path, required=True, help="Original completed reel checkout")
    build.add_argument("--output", type=Path, required=True, help="New package directory outside checkout")
    check = commands.add_parser("verify")
    check.add_argument("directory", type=Path)
    unpack = commands.add_parser("restore")
    unpack.add_argument("archive", type=Path)
    unpack.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "build":
        package(args.source.resolve(), args.output.resolve())
    elif args.command == "restore":
        restore(args.archive.resolve(), args.output.resolve())
    else:
        verify(args.directory.resolve())


if __name__ == "__main__":
    main()
