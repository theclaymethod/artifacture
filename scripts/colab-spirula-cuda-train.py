"""Build Spirula Studio with its native CUDA backend on Colab and benchmark headless 3DGS training."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path


def run_cmd(cmd: list[str], cwd: Path | None = None) -> tuple[float, str]:
    t0 = time.perf_counter()
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    dt = time.perf_counter() - t0
    if proc.returncode != 0:
        tail = "\n".join(proc.stdout.splitlines()[-80:])
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{tail}")
    return dt, proc.stdout


def stream_cmd(cmd: list[str], cwd: Path | None = None, on_sample=None, show_all: bool = False) -> tuple[float, str]:
    t0 = time.perf_counter()
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    stop_evt = threading.Event()
    sampler_thread = None
    if on_sample is not None:
        def _poll() -> None:
            while not stop_evt.is_set():
                on_sample()
                stop_evt.wait(0.4)
        sampler_thread = threading.Thread(target=_poll, daemon=True)
        sampler_thread.start()

    lines: list[str] = []
    assert proc.stdout is not None
    for raw in proc.stdout:
        lines.append(raw)
        line = raw.rstrip()
        if show_all or any(tok in line.lower() for tok in ("step", "iter", "psnr", "ssim", "eval", "save", "ply", "splat", "device", "cuda", "error", "warn")):
            print(line, flush=True)
    rc = proc.wait()
    stop_evt.set()
    if sampler_thread is not None:
        sampler_thread.join(timeout=2.0)
    dt = time.perf_counter() - t0
    out = "".join(lines)
    if rc != 0:
        tail = "\n".join(lines[-80:])
        raise RuntimeError(f"Command failed ({rc}): {' '.join(cmd)}\n{tail}")
    return dt, out


def parse_ply_vertex_count(ply_path: Path) -> int | None:
    with ply_path.open("rb") as f:
        header = f.read(4096).decode("ascii", errors="ignore")
    m = re.search(r"element vertex\s+(\d+)", header)
    return int(m.group(1)) if m else None


def apply_pinhole_only_codegen(repo_dir: Path) -> None:
    print("[colab-spirula-cuda] Trimming CUDA kernel instantiations to Vanilla3DGS + PINHOLE + None...", flush=True)
    gen_py = repo_dir / "tools/codegen/generate_kernel_instantiation.py"
    gen_txt = gen_py.read_text(encoding="utf-8")
    new_gen, n1 = re.subn(
        r"kCameraVariants\s*=\s*\[.*?\]",
        'kCameraVariants = [\n    ("CameraModelType::PINHOLE", "CameraDistortionType::None"),\n]',
        gen_txt,
        count=1,
        flags=re.S,
    )
    if n1 != 1:
        raise RuntimeError(f"Failed to patch kCameraVariants in {gen_py}")

    new_gen, n1b = re.subn(
        r"kPrimitives\s*=\s*\[.*?\]",
        'kPrimitives = [f"Vanilla3DGS<{n}>" for n in range(5)]',
        new_gen,
        count=1,
        flags=re.S,
    )
    if n1b != 1:
        raise RuntimeError(f"Failed to patch kPrimitives in {gen_py}")

    new_gen, n1c = re.subn(
        r"includes\s*=\s*\[\*\(\s*\[\(\"primitives/Primitive3DGS\.cuh\",\s*kernel_filename\)\].*?\)\]\s*\*\s*5",
        'includes = [("primitives/Primitive3DGS.cuh", kernel_filename)] * len(map_body)',
        new_gen,
        count=2,
        flags=re.S,
    )
    if n1c != 2:
        raise RuntimeError(f"Failed to patch 3DGS includes in {gen_py} (matched {n1c})")

    new_gen, n1d = re.subn(
        r"includes\s*=\s*\[\*\(\s*\[\(\"primitives/Primitive3DGS\.cuh\",\s*\"kernels/optim/FusedProjectionBwdOptim_kernel\.cuh\"\)\].*?\)\]\s*\*\s*5",
        'includes = [("primitives/Primitive3DGS.cuh", "kernels/optim/FusedProjectionBwdOptim_kernel.cuh")] * len(map_body)',
        new_gen,
        count=1,
        flags=re.S,
    )
    if n1d != 1:
        raise RuntimeError(f"Failed to patch FPBO includes in {gen_py}")

    new_gen, n1e = re.subn(
        r"maps_2dgs\s*=\s*\[.*?generate_kernel_instantiation\(prefix\s*\+\s*\"2DGS\".*?\)\)",
        "maps_2dgs = []",
        new_gen,
        count=1,
        flags=re.S,
    )
    if n1e != 1:
        raise RuntimeError(f"Failed to skip 2DGS instantiations in {gen_py}")

    new_gen, n1f = re.subn(
        r"generate_RasterizationEval3DFwd\(\)\s*generate_RasterizationEval3DBwd\(\)",
        "# Skipped Eval3D Fwd/Bwd in 3DGS-only fast CUDA build",
        new_gen,
        count=1,
        flags=re.S,
    )
    if n1f != 1:
        raise RuntimeError(f"Failed to skip Eval3D generators in {gen_py}")
    gen_py.write_text(new_gen, encoding="utf-8")

    cam_var = repo_dir / "src/kernels/projection/CameraVariants.cuh"
    cv_txt = cam_var.read_text(encoding="utf-8")
    new_cv, n2 = re.subn(
        r"#define SS_FOR_EACH_CAMERA_VARIANT\(F\).*?^\s*F\(EQUIRECTANGULAR,\s*None\)",
        "#define SS_FOR_EACH_CAMERA_VARIANT(F) F(PINHOLE, None)",
        cv_txt,
        count=1,
        flags=re.M | re.S,
    )
    if n2 != 1:
        raise RuntimeError(f"Failed to patch SS_FOR_EACH_CAMERA_VARIANT in {cam_var}")
    cam_var.write_text(new_cv, encoding="utf-8")

    cam_hdr = repo_dir / "src/core/CameraModel.h"
    ch_txt = cam_hdr.read_text(encoding="utf-8")
    new_ch, n3 = re.subn(
        r"inline bool camera_distortion_is_compiled\(CameraModelType m, CameraDistortionType d\)\s*\{.*?\n\}",
        "inline bool camera_distortion_is_compiled(CameraModelType m, CameraDistortionType d) {\n"
        "    return m == CameraModelType::PINHOLE && d == CameraDistortionType::None;\n}",
        ch_txt,
        count=1,
        flags=re.S,
    )
    if n3 != 1:
        raise RuntimeError(f"Failed to patch camera_distortion_is_compiled in {cam_hdr}")
    cam_hdr.write_text(new_ch, encoding="utf-8")

    for eval_rel, macro in (
        ("src/kernels/raster/RasterizationEval3DFwd.cu", "SS_FOR_EACH_FORWARD_CAMERA_VARIANT"),
        ("src/kernels/raster/RasterizationEval3DBwd.cu", "SS_FOR_EACH_CAMERA_VARIANT"),
    ):
        p = repo_dir / eval_rel
        txt = p.read_text(encoding="utf-8")
        new_txt, ne = re.subn(
            rf"{macro}\(_DISPATCH\)\s*throw std::runtime_error\(\"Unsupported camera model / distortion tier\"\);",
            'throw std::runtime_error("3dgs-only fast CUDA build");',
            txt,
            count=1,
            flags=re.S,
        )
        if ne != 1:
            raise RuntimeError(f"Failed to guard {macro} in {p}")
        p.write_text(new_txt, encoding="utf-8")

    is_3dgs = (
        "(std::is_same_v<SplatPrimitive, Vanilla3DGS<0>> || "
        "std::is_same_v<SplatPrimitive, Vanilla3DGS<1>> || "
        "std::is_same_v<SplatPrimitive, Vanilla3DGS<2>> || "
        "std::is_same_v<SplatPrimitive, Vanilla3DGS<3>> || "
        "std::is_same_v<SplatPrimitive, Vanilla3DGS<4>>)"
    )
    for cu_rel, macro in (
        ("src/kernels/optim/FusedProjectionBwdOptim.cu", "SS_FOR_EACH_CAMERA_VARIANT"),
        ("src/kernels/projection/ProjectionBwd.cu", "SS_FOR_EACH_CAMERA_VARIANT"),
        ("src/kernels/projection/ProjectionBwdQuantGrad.cu", "SS_FOR_EACH_CAMERA_VARIANT"),
        ("src/kernels/projection/ProjectionFwd.cu", "SS_FOR_EACH_FORWARD_CAMERA_VARIANT"),
        ("src/kernels/projection/ProjectionPackedFwd.cu", "SS_FOR_EACH_FORWARD_CAMERA_VARIANT"),
    ):
        p = repo_dir / cu_rel
        txt = p.read_text(encoding="utf-8")
        if "#include <type_traits>" not in txt:
            txt = "#include <type_traits>\n" + txt
        new_txt, np_cnt = re.subn(
            rf"{macro}\(_DISPATCH\)\s*throw std::runtime_error\(\"Unsupported camera model / distortion tier\"\);",
            f"if constexpr {is_3dgs} {{\n"
            f"        {macro}(_DISPATCH)\n"
            '            throw std::runtime_error("Unsupported camera model / distortion tier");\n'
            "    } else {\n"
            '        throw std::runtime_error("3dgs-only fast CUDA build");\n'
            "    }",
            txt,
            flags=re.S,
        )
        if np_cnt < 1:
            raise RuntimeError(f"Failed to wrap {macro} in {p}")
        p.write_text(new_txt, encoding="utf-8")

    dt_gen, out_gen = run_cmd([sys.executable, "tools/codegen/generate_kernel_instantiation.py"], cwd=repo_dir)
    cu_count = len(list((repo_dir / "src/instantiations").glob("*.cu")))
    print(f"[colab-spirula-cuda] Codegen finished in {dt_gen:.2f}s ({cu_count} .cu files remain)", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build & run headless CUDA Spirula Studio on Colab GPU.")
    parser.add_argument("--repo-dir", default="/content/spirula-studio")
    parser.add_argument("--data-dir", default="/content/datasets/tandt/truck")
    parser.add_argument("--out-prefix", default="/content/spirula_out")
    parser.add_argument("--run-name", default="truck_cuda")
    parser.add_argument("--steps", type=int, default=3000)
    parser.add_argument("--out-ply", default="/content/spirula-truck-cuda.ply")
    parser.add_argument("--bench-json", default="/content/spirula-cuda-bench.json")
    parser.add_argument("--full-camera-matrix", action="store_true", help="Compile all 10 camera/distortion models.")
    args, _ = parser.parse_known_args()

    _, gpu_csv = run_cmd([
        "nvidia-smi",
        "--query-gpu=name,driver_version,memory.total,compute_cap",
        "--format=csv,noheader",
    ])
    gpu_line = gpu_csv.strip().splitlines()[0]
    gpu_parts = [p.strip() for p in gpu_line.split(",")]
    print(f"[colab-spirula-cuda] GPU: {gpu_line}", flush=True)

    _, nvcc_out = run_cmd(["nvcc", "--version"])
    print(f"[colab-spirula-cuda] nvcc: {nvcc_out.strip().splitlines()[-1]}", flush=True)

    missing_bins = [b for b in ("ninja", "cmake", "pkg-config") if shutil.which(b) is None]
    if missing_bins or not Path("/usr/include/omp.h").exists():
        print(f"[colab-spirula-cuda] Installing build deps (missing={missing_bins})...", flush=True)
        run_cmd(["apt-get", "update", "-qq"])
        run_cmd(["apt-get", "install", "-y", "-qq", "cmake", "ninja-build", "libomp-dev", "pkg-config", "git"])

    if importlib.util.find_spec("huggingface_hub") is None:
        print("[colab-spirula-cuda] Installing huggingface_hub...", flush=True)
        run_cmd([sys.executable, "-m", "pip", "install", "-q", "huggingface_hub"])

    repo_dir = Path(args.repo_dir)
    if not (repo_dir / ".git").exists():
        print("[colab-spirula-cuda] Cloning harry7557558/spirula-studio (master)...", flush=True)
        run_cmd([
            "git",
            "clone",
            "--depth",
            "1",
            "--branch",
            "master",
            "https://github.com/harry7557558/spirula-studio.git",
            str(repo_dir),
        ])

    build_dir = repo_dir / "build_cuda"
    spirula_bin: Path | None = None
    for cand in (build_dir / "spirula", build_dir / "bin" / "spirula"):
        if cand.exists():
            spirula_bin = cand
            break

    build_sec = 0.0
    if spirula_bin is None:
        if not args.full_camera_matrix:
            apply_pinhole_only_codegen(repo_dir)
        print("[colab-spirula-cuda] Configuring CMake (-DSS_BACKEND=cuda -DSS_BUILD_GUI=OFF)...", flush=True)
        cfg_sec, cfg_out = run_cmd([
            "cmake",
            "-G",
            "Ninja",
            "-S",
            str(repo_dir),
            "-B",
            str(build_dir),
            "-DCMAKE_BUILD_TYPE=Release",
            "-DSS_BACKEND=cuda",
            "-DSS_BUILD_GUI=OFF",
            "-DSS_BUILD_SFM=OFF",
            "-DSS_BUILD_SAM=OFF",
            "-DSS_BUILD_BACKEND_TESTS=OFF",
            "-DSS_CHECK_COMMENTS=OFF",
        ])
        for line in cfg_out.splitlines():
            if any(k in line for k in ("CUDA", "CUDAToolkit", "architecture", "configured")):
                print(line, flush=True)
        nproc = str(os.cpu_count() or 2)
        print(f"[colab-spirula-cuda] Compiling `spirula` CUDA target (-j{nproc})...", flush=True)
        comp_sec, _ = stream_cmd(
            ["cmake", "--build", str(build_dir), "--target", "spirula", f"-j{nproc}"],
            show_all=True,
        )
        build_sec = cfg_sec + comp_sec
        for cand in (build_dir / "spirula", build_dir / "bin" / "spirula"):
            if cand.exists():
                spirula_bin = cand
                break
        if spirula_bin is None:
            found = list(build_dir.rglob("spirula"))
            spirula_bin = found[0] if found else None
        if spirula_bin is None:
            raise FileNotFoundError(f"Built `spirula` binary not found in {build_dir}")
        print(f"[colab-spirula-cuda] Built {spirula_bin} in {build_sec:.2f}s", flush=True)

    _, ver_out = run_cmd([str(spirula_bin), "--version"])
    print(f"[colab-spirula-cuda] Binary version: {ver_out.strip()}", flush=True)
    shutil.copy2(spirula_bin, "/content/spirula-cuda-bin")

    data_dir = Path(args.data_dir)
    if not (data_dir / "images").exists() or not (data_dir / "sparse").exists():
        print("[colab-spirula-cuda] Downloading tandt/truck COLMAP dataset...", flush=True)
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id="alexmkwizu/gaussian_training_datasets",
            repo_type="dataset",
            allow_patterns=["tandt/truck/*"],
            local_dir="/content/datasets",
        )

    out_run_dir = Path(args.out_prefix) / args.run_name
    if out_run_dir.exists():
        shutil.rmtree(out_run_dir)

    peak_vram_mib = 0

    def sample_vram() -> None:
        nonlocal peak_vram_mib
        try:
            res = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=2,
            )
            if res.returncode == 0:
                val = int(res.stdout.strip().splitlines()[0])
                if val > peak_vram_mib:
                    peak_vram_mib = val
        except Exception:
            pass

    train_cmd = [
        str(spirula_bin),
        "train",
        "3dgs",
        "--data",
        str(data_dir),
        "--num-iterations",
        str(args.steps),
        "--output-dir-prefix",
        args.out_prefix,
        "--output-dir-name",
        args.run_name,
        "--device",
        "0",
        "--disable-viewer",
        "1",
        "--keep-viewer-alive",
        "0",
        "--eval-mode",
        "interval",
        "--eval-interval",
        "8",
        "--eval-lpips",
        "0",
        "--steps-per-save",
        "-1",
    ]
    print(f"[colab-spirula-cuda] Training {args.steps} steps on {data_dir}...", flush=True)
    train_sec, train_log = stream_cmd(train_cmd, on_sample=sample_vram)
    Path("/content/spirula-cuda-train.log").write_text(train_log, encoding="utf-8")

    output_files = sorted(str(p.relative_to(out_run_dir)) for p in out_run_dir.rglob("*") if p.is_file())
    ply_candidates = sorted(out_run_dir.rglob("*.ply"))
    if not ply_candidates:
        raise FileNotFoundError(f"No .ply output found in {out_run_dir}; files={output_files}")
    src_ply = ply_candidates[0]
    out_ply = Path(args.out_ply)
    shutil.copy2(src_ply, out_ply)

    splat_count = parse_ply_vertex_count(out_ply)
    ply_bytes = out_ply.stat().st_size

    metrics = None
    metrics_path = out_run_dir / "metrics.json"
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))

    summary = {
        "backend": "spirula-cuda",
        "version": ver_out.strip(),
        "gpu_name": gpu_parts[0] if len(gpu_parts) > 0 else gpu_line,
        "driver": gpu_parts[1] if len(gpu_parts) > 1 else None,
        "gpu_memory_total": gpu_parts[2] if len(gpu_parts) > 2 else None,
        "compute_cap": gpu_parts[3] if len(gpu_parts) > 3 else None,
        "dataset": "tandt/truck",
        "steps": args.steps,
        "build_sec": round(build_sec, 2),
        "wall_sec": round(train_sec, 2),
        "it_per_sec": round(args.steps / max(train_sec, 1e-6), 2),
        "peak_vram_mib": peak_vram_mib,
        "splat_count": splat_count,
        "ply_bytes": ply_bytes,
        "metrics": metrics,
        "output_files": output_files,
        "out_ply": str(out_ply),
    }
    Path(args.bench_json).write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("[colab-spirula-cuda] SUMMARY:", json.dumps(summary, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
