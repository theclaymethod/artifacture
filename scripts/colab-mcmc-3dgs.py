"""Floater-Free MCMC-3DGS Training via Nerfstudio gsplat on Colab CUDA GPU."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import shutil
import struct
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image


def install_deps() -> None:
    for mod, pkg in (("gsplat", "gsplat"), ("plyfile", "plyfile"), ("huggingface_hub", "huggingface_hub")):
        if importlib.util.find_spec(mod) is None:
            print(f"[colab-mcmc] Installing {pkg}...", flush=True)
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pkg])


def find_colmap_root(search_root: Path) -> Path:
    for cand in [search_root] + sorted(p for p in search_root.rglob("*") if p.is_dir()):
        if "__MACOSX" in cand.parts:
            continue
        if (cand / "images").is_dir() and (cand / "sparse").is_dir():
            return cand
    raise FileNotFoundError(f"No COLMAP images/ + sparse/ found under {search_root}")


def qvec2rotmat(qvec: np.ndarray) -> np.ndarray:
    w, x, y, z = qvec
    return np.array([
        [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * z * w, 2 * x * z + 2 * y * w],
        [2 * x * y + 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * x * w],
        [2 * x * z - 2 * y * w, 2 * y * z + 2 * x * w, 1 - 2 * x * x - 2 * y * y],
    ], dtype=np.float32)


def read_colmap_bin(sparse_dir: Path):
    sub = sparse_dir / "0" if (sparse_dir / "0").is_dir() else sparse_dir
    cams = {}
    with (sub / "cameras.bin").open("rb") as f:
        n_cams = struct.unpack("<Q", f.read(8))[0]
        for _ in range(n_cams):
            cid, mid, w, h = struct.unpack("<iiQQ", f.read(24))
            num_params = {0: 3, 1: 4, 2: 4, 3: 5, 4: 8, 5: 8}.get(mid, 4)
            params = struct.unpack(f"<{num_params}d", f.read(8 * num_params))
            if mid in (0, 2, 3):
                fx = fy = params[0]
                cx, cy = params[1], params[2]
            else:
                fx, fy, cx, cy = params[0], params[1], params[2], params[3]
            cams[cid] = (w, h, float(fx), float(fy), float(cx), float(cy))

    frames = []
    with (sub / "images.bin").open("rb") as f:
        n_imgs = struct.unpack("<Q", f.read(8))[0]
        for _ in range(n_imgs):
            _iid = struct.unpack("<i", f.read(4))[0]
            qvec = np.array(struct.unpack("<4d", f.read(32)), dtype=np.float32)
            tvec = np.array(struct.unpack("<3d", f.read(24)), dtype=np.float32)
            cid = struct.unpack("<i", f.read(4))[0]
            name_bytes = bytearray()
            while (ch := f.read(1)) != b"\x00":
                name_bytes.extend(ch)
            name = name_bytes.decode("utf-8")
            n_pts2d = struct.unpack("<Q", f.read(8))[0]
            f.read(24 * n_pts2d)
            R = qvec2rotmat(qvec)
            w2c = np.eye(4, dtype=np.float32)
            w2c[:3, :3] = R
            w2c[:3, 3] = tvec
            frames.append((name, w2c, cams[cid]))
    frames.sort(key=lambda r: r[0])

    pts_xyz, pts_rgb = [], []
    with (sub / "points3D.bin").open("rb") as f:
        n_pts = struct.unpack("<Q", f.read(8))[0]
        for _ in range(n_pts):
            _pid = struct.unpack("<Q", f.read(8))[0]
            xyz = struct.unpack("<3d", f.read(24))
            rgb = struct.unpack("<3B", f.read(3))
            _err = struct.unpack("<d", f.read(8))[0]
            trk_len = struct.unpack("<Q", f.read(8))[0]
            f.read(8 * trk_len)
            pts_xyz.append(xyz)
            pts_rgb.append(rgb)
    return frames, np.array(pts_xyz, dtype=np.float32), np.array(pts_rgb, dtype=np.float32) / 255.0


def main() -> int:
    parser = argparse.ArgumentParser(description="Train floater-free MCMC-3DGS using gsplat on Colab CUDA.")
    parser.add_argument("--data-zip", default=None)
    parser.add_argument("--data-dir", default="/content/datasets/tandt/truck")
    parser.add_argument("--hf-repo", default="alexmkwizu/gaussian_training_datasets")
    parser.add_argument("--hf-subdir", default="tandt/truck")
    parser.add_argument("--steps", type=int, default=3000)
    parser.add_argument("--cap-max", type=int, default=300000)
    parser.add_argument("--eval-interval", type=int, default=8)
    parser.add_argument("--out-ply", default="/content/mcmc-out.ply")
    parser.add_argument("--meta-json", default="/content/mcmc-meta.json")
    args, _ = parser.parse_known_args()

    t_wall0 = time.perf_counter()
    install_deps()

    import torch
    import torch.nn.functional as F
    from gsplat import MCMCStrategy, rasterization
    from plyfile import PlyData, PlyElement

    device = torch.device("cuda")
    gpu_name = torch.cuda.get_device_name(0)
    torch.cuda.reset_peak_memory_stats()

    if args.data_zip:
        ex_dir = Path("/content/mcmc_ds")
        if ex_dir.exists():
            shutil.rmtree(ex_dir)
        ex_dir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.data_zip, "r") as zf:
            zf.extractall(ex_dir)
        data_dir = find_colmap_root(ex_dir)
        dataset_label = Path(args.data_zip).name
    else:
        data_dir = Path(args.data_dir)
        if not (data_dir / "images").exists() or not (data_dir / "sparse").exists():
            from huggingface_hub import snapshot_download
            snapshot_download(
                repo_id=args.hf_repo,
                repo_type="dataset",
                allow_patterns=[f"{args.hf_subdir}/*"],
                local_dir="/content/datasets",
            )
            data_dir = Path("/content/datasets") / args.hf_subdir
        dataset_label = args.hf_subdir

    frames, pts_xyz, pts_rgb = read_colmap_bin(data_dir / "sparse")
    img_root = data_dir / "images"

    # Load undistorted PINHOLE camera frames at stored resolution
    dataset_items = []
    for idx, (fname, w2c, (w, h, fx, fy, cx, cy)) in enumerate(frames):
        im_path = img_root / fname
        if not im_path.exists():
            im_path = next(img_root.rglob(Path(fname).name))
        im = Image.open(im_path).convert("RGB")
        if im.size != (w, h):
            sx, sy = im.width / w, im.height / h
            w, h = im.width, im.height
            fx, fy, cx, cy = fx * sx, fy * sy, cx * sx, cy * sy
        arr = torch.from_numpy(np.asarray(im, dtype=np.float32) / 255.0).to(device)
        viewmat = torch.from_numpy(w2c).to(device)
        K = torch.tensor([[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]], dtype=torch.float32, device=device)
        dataset_items.append((idx, arr, viewmat, K, w, h))

    train_items = [it for it in dataset_items if it[0] % args.eval_interval != 0]
    eval_items = [it for it in dataset_items if it[0] % args.eval_interval == 0]

    n_init = len(pts_xyz)
    dist2_approx = np.full(n_init, 0.02, dtype=np.float32)
    try:
        from scipy.spatial import cKDTree
        d3, _ = cKDTree(pts_xyz).query(pts_xyz, k=4)
        dist2_approx = np.clip(np.mean(d3[:, 1:] ** 2, axis=1), 1e-7, 1.0).astype(np.float32)
    except Exception:
        pass
    scales_init = np.log(np.sqrt(dist2_approx))[:, None].repeat(3, axis=1).astype(np.float32)

    sh0 = ((pts_rgb - 0.5) / 0.28209479177387814)[:, None, :].astype(np.float32)
    shN = np.zeros((n_init, 15, 3), dtype=np.float32)
    quats_init = np.zeros((n_init, 4), dtype=np.float32)
    quats_init[:, 0] = 1.0
    op_init = np.full((n_init,), -0.0, dtype=np.float32)  # sigmoid(0) = 0.5 for MCMC init

    params = {
        "means": torch.nn.Parameter(torch.from_numpy(pts_xyz).to(device)),
        "scales": torch.nn.Parameter(torch.from_numpy(scales_init).to(device)),
        "quats": torch.nn.Parameter(torch.from_numpy(quats_init).to(device)),
        "opacities": torch.nn.Parameter(torch.from_numpy(op_init).to(device)),
        "sh0": torch.nn.Parameter(torch.from_numpy(sh0).to(device)),
        "shN": torch.nn.Parameter(torch.from_numpy(shN).to(device)),
    }
    scene_scale = float(np.percentile(np.linalg.norm(pts_xyz - np.median(pts_xyz, axis=0), axis=1), 90))
    lrs = {"means": 1.6e-4 * scene_scale, "scales": 5e-3, "quats": 1e-3, "opacities": 5e-2, "sh0": 2.5e-3, "shN": 2.5e-3 / 20.0}
    optimizers = {k: torch.optim.Adam([v], lr=lrs[k], eps=1e-15) for k, v in params.items()}

    strategy = MCMCStrategy(cap_max=args.cap_max, noise_lr=5e5, refine_start_iter=300, refine_stop_iter=max(args.steps - 300, 600), refine_every=100)
    strategy.check_sanity(params, optimizers)
    strat_state = strategy.initialize_state()

    def ssim_loss(img1: torch.Tensor, img2: torch.Tensor) -> torch.Tensor:
        x = img1.permute(2, 0, 1).unsqueeze(0)
        y = img2.permute(2, 0, 1).unsqueeze(0)
        C1, C2 = 0.01 ** 2, 0.03 ** 2
        mu_x = F.avg_pool2d(x, 11, 1, 5)
        mu_y = F.avg_pool2d(y, 11, 1, 5)
        sig_x = F.avg_pool2d(x * x, 11, 1, 5) - mu_x * mu_x
        sig_y = F.avg_pool2d(y * y, 11, 1, 5) - mu_y * mu_y
        sig_xy = F.avg_pool2d(x * y, 11, 1, 5) - mu_x * mu_y
        ssim_map = ((2 * mu_x * mu_y + C1) * (2 * sig_xy + C2)) / ((mu_x * mu_x + mu_y * mu_y + C1) * (sig_x + sig_y + C2))
        return 1.0 - ssim_map.mean()

    rng = np.random.default_rng(7)
    torch.cuda.synchronize()
    t_train0 = time.perf_counter()

    for step in range(args.steps):
        _, gt, viewmat, K, w, h = train_items[int(rng.integers(0, len(train_items)))]
        sh_deg = min(3, step // 800)
        colors = torch.cat([params["sh0"], params["shN"]], dim=1)
        renders, alphas, info = rasterization(
            means=params["means"],
            quats=F.normalize(params["quats"], dim=-1),
            scales=torch.exp(params["scales"]),
            opacities=torch.sigmoid(params["opacities"]),
            colors=colors,
            viewmats=viewmat[None],
            Ks=K[None],
            width=w,
            height=h,
            sh_degree=sh_deg,
            packed=False,
        )
        strategy.step_pre_backward(params=params, optimizers=optimizers, state=strat_state, step=step, info=info)
        pred = renders[0].clamp(0.0, 1.0)
        l1 = F.l1_loss(pred, gt)
        loss = 0.8 * l1 + 0.2 * ssim_loss(pred, gt) + 0.005 * torch.sigmoid(params["opacities"]).mean()
        loss.backward()
        for opt in optimizers.values():
            opt.step()
            opt.zero_grad(set_to_none=True)
        strategy.step_post_backward(params=params, optimizers=optimizers, state=strat_state, step=step, info=info, lr=lrs["means"])
        if step % 500 == 0 or step == args.steps - 1:
            print(f"[colab-mcmc] step {step + 1}/{args.steps} splats={len(params['means']):,} loss={loss.item():.4f}", flush=True)

    torch.cuda.synchronize()
    train_sec = time.perf_counter() - t_train0

    # Held-out evaluation matching Spirula / Brush interval=8
    psnrs, ssims = [], []
    with torch.no_grad():
        colors = torch.cat([params["sh0"], params["shN"]], dim=1)
        q_norm = F.normalize(params["quats"], dim=-1)
        sc_exp = torch.exp(params["scales"])
        op_sig = torch.sigmoid(params["opacities"])
        for _, gt, viewmat, K, w, h in eval_items:
            renders, _, _ = rasterization(
                means=params["means"], quats=q_norm, scales=sc_exp, opacities=op_sig, colors=colors,
                viewmats=viewmat[None], Ks=K[None], width=w, height=h, sh_degree=3, packed=False,
            )
            pred = renders[0].clamp(0.0, 1.0)
            mse = F.mse_loss(pred, gt).item()
            psnrs.append(-10.0 * math.log10(max(mse, 1e-10)))
            ssims.append(1.0 - float(ssim_loss(pred, gt).item()))

    # Save standard 3DGS PLY
    xyz = params["means"].detach().cpu().numpy()
    normals = np.zeros_like(xyz)
    f_dc = params["sh0"].detach().transpose(1, 2).flatten(start_dim=1).cpu().numpy()
    f_rest = params["shN"].detach().transpose(1, 2).flatten(start_dim=1).cpu().numpy()
    op = params["opacities"].detach().unsqueeze(1).cpu().numpy()
    sc = params["scales"].detach().cpu().numpy()
    rot = params["quats"].detach().cpu().numpy()

    attr_names = (
        ["x", "y", "z", "nx", "ny", "nz"]
        + [f"f_dc_{i}" for i in range(f_dc.shape[1])]
        + [f"f_rest_{i}" for i in range(f_rest.shape[1])]
        + ["opacity"]
        + [f"scale_{i}" for i in range(3)]
        + [f"rot_{i}" for i in range(4)]
    )
    dtype = [(n, "f4") for n in attr_names]
    elems = np.empty(len(xyz), dtype=dtype)
    all_cols = np.concatenate([xyz, normals, f_dc, f_rest, op, sc, rot], axis=1)
    elems[:] = list(map(tuple, all_cols))

    out_ply = Path(args.out_ply)
    out_ply.parent.mkdir(parents=True, exist_ok=True)
    PlyData([PlyElement.describe(elems, "vertex")]).write(str(out_ply))

    peak_vram_mib = int(torch.cuda.max_memory_allocated() / (1024 * 1024))
    meta = {
        "backend": "gsplat-mcmc-cuda",
        "gpu_name": gpu_name,
        "dataset_label": dataset_label,
        "steps": args.steps,
        "cap_max": args.cap_max,
        "train_sec": round(train_sec, 2),
        "wall_sec": round(time.perf_counter() - t_wall0, 2),
        "it_per_sec": round(args.steps / max(train_sec, 1e-6), 2),
        "peak_vram_mib": peak_vram_mib,
        "splat_count": int(len(xyz)),
        "ply_bytes": out_ply.stat().st_size,
        "num_eval_images": len(eval_items),
        "avg_psnr": round(float(np.mean(psnrs)), 4),
        "avg_ssim": round(float(np.mean(ssims)), 4),
        "out_ply": str(out_ply),
    }
    Path(args.meta_json).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("[colab-mcmc] SUMMARY:", json.dumps(meta, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
