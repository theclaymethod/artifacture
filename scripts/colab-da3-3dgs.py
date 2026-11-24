"""Pose-Free Feed-Forward 3DGS Reconstruction via ByteDance-Seed Depth Anything 3 (DA3-GIANT-1.1) on Colab GPU."""

from __future__ import annotations

import argparse
import glob
import importlib.util
import json
import re
import subprocess
import sys
import time
import types
import zipfile
from pathlib import Path


def run_cmd(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stdout[-3000:]}")
    return proc.stdout


def _install_stub_module(name: str) -> None:
    if importlib.util.find_spec(name) is not None or name in sys.modules:
        return

    class _StubMod(types.ModuleType):
        def __getattr__(self, item: str):
            if item.startswith("__") and item.endswith("__"):
                raise AttributeError(item)
            sub_name = f"{self.__name__}.{item}"
            if sub_name in sys.modules:
                return sys.modules[sub_name]
            class _Dummy:
                def __init__(self, *a, **kw): pass
                def __call__(self, *a, **kw): return None
            _Dummy.__name__ = item
            return _Dummy

    parts = name.split(".")
    for i in range(1, len(parts) + 1):
        mod_name = ".".join(parts[:i])
        if mod_name not in sys.modules:
            m = _StubMod(mod_name)
            m.__path__ = []
            m.__file__ = f"<stub:{mod_name}>"
            m.__package__ = mod_name
            sys.modules[mod_name] = m
            if i > 1:
                setattr(sys.modules[".".join(parts[: i - 1])], parts[i - 1], m)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run pose-free Depth Anything 3 -> 3DGS PLY on Colab GPU.")
    parser.add_argument("--images-zip", default=None)
    parser.add_argument("--images-dir", default=None)
    parser.add_argument("--hf-repo", default="alexmkwizu/gaussian_training_datasets")
    parser.add_argument("--hf-subdir", default="tandt/truck")
    parser.add_argument("--model-id", default="depth-anything/DA3-GIANT-1.1")
    parser.add_argument("--num-views", type=int, default=12)
    parser.add_argument("--out-dir", default="/content/da3_out")
    parser.add_argument("--out-ply", default="/content/da3-out.ply")
    parser.add_argument("--meta-json", default="/content/da3-meta.json")
    args, _ = parser.parse_known_args()

    t_all = time.perf_counter()
    da3_repo = Path("/content/Depth-Anything-3")
    if not (da3_repo / "src" / "depth_anything_3").exists():
        print("[colab-da3] Cloning Depth-Anything-3 repo...", flush=True)
        run_cmd(["git", "clone", "--depth", "1", "https://github.com/ByteDance-Seed/Depth-Anything-3.git", str(da3_repo)])

    needed = [pkg for mod, pkg in (
        ("einops", "einops"),
        ("omegaconf", "omegaconf"),
        ("safetensors", "safetensors"),
        ("huggingface_hub", "huggingface_hub"),
        ("plyfile", "plyfile"),
        ("trimesh", "trimesh"),
        ("addict", "addict"),
        ("e3nn", "e3nn"),
    ) if importlib.util.find_spec(mod) is None]
    if needed:
        print(f"[colab-da3] Installing runtime deps: {', '.join(needed)}...", flush=True)
        run_cmd([sys.executable, "-m", "pip", "install", "-q", *needed])

    src_path = str(da3_repo / "src")
    if src_path not in sys.path:
        sys.path.insert(0, src_path)

    import torch

    for opt_mod in (
        "moviepy",
        "moviepy.editor",
        "gsplat",
        "open3d",
        "pycolmap",
        "evo",
        "evo.core",
        "evo.core.trajectory",
        "pillow_heif",
    ):
        _install_stub_module(opt_mod)

    from depth_anything_3.api import DepthAnything3
    from depth_anything_3.utils.gsply_helpers import save_gaussian_ply

    gpu_name = torch.cuda.get_device_name(0)
    torch.cuda.reset_peak_memory_stats()

    if args.images_zip:
        extract_dir = Path("/content/da3_inputs")
        if extract_dir.exists():
            import shutil
            shutil.rmtree(extract_dir)
        extract_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.images_zip, "r") as zf:
            zf.extractall(extract_dir)
        img_paths = sorted(
            str(p) for p in extract_dir.rglob("*")
            if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and "__MACOSX" not in p.parts
        )
    elif args.images_dir:
        img_paths = sorted(
            str(p) for p in Path(args.images_dir).rglob("*")
            if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        )
    else:
        ds_root = Path("/content/datasets") / args.hf_subdir
        img_dir = ds_root / "images"
        if not img_dir.exists():
            from huggingface_hub import snapshot_download
            snapshot_download(
                repo_id=args.hf_repo,
                repo_type="dataset",
                allow_patterns=[f"{args.hf_subdir}/images/*"],
                local_dir="/content/datasets",
            )
        img_paths = sorted(
            str(p) for p in img_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )

    if not img_paths:
        raise FileNotFoundError("No input images found for DA3 reconstruction")

    if len(img_paths) > args.num_views:
        step = len(img_paths) / args.num_views
        img_paths = [img_paths[int(i * step)] for i in range(args.num_views)]
    print(f"[colab-da3] Running {args.model_id} (zero COLMAP poses) on {len(img_paths)} views...", flush=True)

    t_load0 = time.perf_counter()
    device = torch.device("cuda")
    model = DepthAnything3.from_pretrained(args.model_id).to(device=device)
    load_sec = time.perf_counter() - t_load0

    out_ply = Path(args.out_ply)
    out_ply.parent.mkdir(parents=True, exist_ok=True)

    torch.cuda.synchronize()
    t_inf0 = time.perf_counter()
    prediction = model.inference(
        img_paths,
        export_dir=None,
        infer_gs=True,
    )
    torch.cuda.synchronize()
    infer_sec = time.perf_counter() - t_inf0

    pred_depth = torch.from_numpy(prediction.depth).unsqueeze(-1).to(prediction.gaussians.means)
    save_gaussian_ply(
        gaussians=prediction.gaussians,
        save_path=str(out_ply),
        ctx_depth=pred_depth,
        shift_and_scale=False,
        save_sh_dc_only=True,
        gs_views_interval=1,
        inv_opacity=True,
        prune_by_depth_percent=0.9,
    )

    peak_vram_mib = int(torch.cuda.max_memory_allocated() / (1024 * 1024))

    hdr = out_ply.read_bytes()[:4096].decode("ascii", errors="ignore")
    m = re.search(r"element vertex\s+(\d+)", hdr)
    splat_count = int(m.group(1)) if m else None

    meta = {
        "backend": "depth-anything-3-feedforward",
        "model_id": args.model_id,
        "gpu_name": gpu_name,
        "num_views": len(img_paths),
        "pose_free": True,
        "load_sec": round(load_sec, 2),
        "infer_sec": round(infer_sec, 2),
        "wall_sec": round(time.perf_counter() - t_all, 2),
        "peak_vram_mib": peak_vram_mib,
        "splat_count": splat_count,
        "ply_bytes": out_ply.stat().st_size,
        "extrinsics_shape": list(prediction.extrinsics.shape) if getattr(prediction, "extrinsics", None) is not None else None,
        "out_ply": str(out_ply),
    }
    Path(args.meta_json).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("[colab-da3] SUMMARY:", json.dumps(meta, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
