"""Offload single-image 3D Gaussian splat synthesis to a Colab CUDA GPU using apple/ml-sharp."""

from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

if importlib.util.find_spec("sharp") is None:
    print("[colab-sharp] Installing apple/ml-sharp (--no-deps)...")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "--no-deps", "git+https://github.com/apple/ml-sharp.git"]
    )

from sharp.models import PredictorParams, create_predictor
from sharp.utils import io as sharp_io
from sharp.utils.gaussians import save_ply, unproject_gaussians

DEFAULT_MODEL_URL = "https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt"
INTERNAL_SHAPE = (1536, 1536)


@torch.no_grad()
def synthesize_gaussians(
    image_path: Path,
    out_ply: Path,
    checkpoint: str | None = None,
) -> None:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU required on Colab for SHARP splat synthesis.")

    device = torch.device("cuda")
    gpu_name = torch.cuda.get_device_name(0)
    print(f"[colab-sharp] GPU: {gpu_name}")

    t_load0 = time.perf_counter()
    if checkpoint:
        state_dict = torch.load(checkpoint, weights_only=True)
    else:
        state_dict = torch.hub.load_state_dict_from_url(DEFAULT_MODEL_URL, progress=True)
    predictor = create_predictor(PredictorParams())
    predictor.load_state_dict(state_dict)
    predictor.eval().to(device)
    print(f"[colab-sharp] Model loaded in {time.perf_counter() - t_load0:.2f}s")

    image, _, f_px = sharp_io.load_rgb(image_path)
    height, width = image.shape[:2]
    print(f"[colab-sharp] Input image: {image_path} ({width}x{height}, f_px={f_px:.1f})")

    image_pt = torch.from_numpy(image.copy()).float().to(device).permute(2, 0, 1) / 255.0
    disparity_factor = torch.tensor([f_px / width], dtype=torch.float32, device=device)
    image_resized = F.interpolate(
        image_pt[None],
        size=(INTERNAL_SHAPE[1], INTERNAL_SHAPE[0]),
        mode="bilinear",
        align_corners=True,
    )

    torch.cuda.synchronize()
    t0 = time.perf_counter()
    gaussians_ndc = predictor(image_resized, disparity_factor)
    intrinsics = torch.tensor(
        [
            [f_px, 0.0, width / 2.0, 0.0],
            [0.0, f_px, height / 2.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
        dtype=torch.float32,
    )
    intrinsics_resized = intrinsics.clone()
    intrinsics_resized[0] *= INTERNAL_SHAPE[0] / width
    intrinsics_resized[1] *= INTERNAL_SHAPE[1] / height

    gaussians = unproject_gaussians(
        gaussians_ndc,
        torch.eye(4, device=device),
        intrinsics_resized.to(device),
        INTERNAL_SHAPE,
    )
    torch.cuda.synchronize()
    infer_s = time.perf_counter() - t0

    out_ply.parent.mkdir(parents=True, exist_ok=True)
    save_ply(gaussians, f_px, (height, width), out_ply)

    means = gaussians.mean_vectors.reshape(-1, 3).detach().cpu().numpy()
    mins = np.min(means, axis=0)
    maxs = np.max(means, axis=0)
    size_mb = out_ply.stat().st_size / (1024.0 * 1024.0)
    print(
        f"[colab-sharp] Synthesized {means.shape[0]} Gaussians in {infer_s:.3f}s -> "
        f"{out_ply} ({size_mb:.2f} MB)"
    )
    print(
        f"[colab-sharp] Bounds X:[{mins[0]:.2f}, {maxs[0]:.2f}] "
        f"Y:[{mins[1]:.2f}, {maxs[1]:.2f}] Z:[{mins[2]:.2f}, {maxs[2]:.2f}]"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate 3DGS .ply from a single image via SHARP.")
    parser.add_argument("--input", default="/content/ruin-archway.png")
    parser.add_argument("--output", default="/content/ruin-archway.ply")
    parser.add_argument("--checkpoint", default=None)
    args, _unknown = parser.parse_known_args()
    synthesize_gaussians(Path(args.input), Path(args.output), args.checkpoint)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
