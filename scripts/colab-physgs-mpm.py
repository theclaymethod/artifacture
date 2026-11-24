"""Real GPU Continuum-Mechanics Destruction on 3D Gaussian Splats using NVIDIA Warp MLS-MPM on Colab CUDA."""

from __future__ import annotations

import argparse
import importlib.util
import json
import struct
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

for mod_name, pip_name in (("plyfile", "plyfile"), ("warp", "warp-lang")):
    if importlib.util.find_spec(mod_name) is None:
        print(f"[colab-physgs-mpm] Installing {pip_name}...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", pip_name])

import warp as wp
from plyfile import PlyData, PlyElement

wp.init()


@wp.func
def compute_svd_polar(F: wp.mat33):
    U = wp.mat33()
    sigma = wp.vec3()
    V = wp.mat33()
    wp.svd3(F, U, sigma, V)
    return U, sigma, V


@wp.kernel
def zero_grid_kernel(grid_mv: wp.array(dtype=wp.vec4)):
    tid = wp.tid()
    grid_mv[tid] = wp.vec4(0.0, 0.0, 0.0, 0.0)


@wp.kernel
def p2g_kernel(
    x: wp.array(dtype=wp.vec3),
    v: wp.array(dtype=wp.vec3),
    C: wp.array(dtype=wp.mat33),
    F: wp.array(dtype=wp.mat33),
    strain_arr: wp.array(dtype=float),
    grid_mv: wp.array(dtype=wp.vec4),
    inv_dx: float,
    dx: float,
    dt: float,
    p_vol: float,
    p_mass: float,
    mu0: float,
    la0: float,
    yield_stress: float,
    grid_res: int,
    blast_active: float,
    blast_origin: wp.vec3,
    blast_radius: float,
):
    p = wp.tid()
    xp = x[p]
    if strain_arr[p] < 0.0:
        # Locked / unactivated hero particle prior to shockwave arrival
        return

    Fp = F[p]
    # Soften cohesion smoothly once plastic strain rises so fractured chunks detach cleanly
    st = strain_arr[p]
    cohesion = wp.max(0.06, 1.0 - st * 1.45)
    mu = mu0 * cohesion
    la = la0 * cohesion

    # Check if kinetic shockwave front has crossed this particle -> induce crack damage
    d_blast = wp.length(xp - blast_origin)
    if blast_active > 0.5 and d_blast < blast_radius:
        front_band = wp.exp(-((d_blast - blast_radius) * (d_blast - blast_radius)) / (dx * dx * 3.5))
        if front_band > 0.12:
            strain_arr[p] = wp.min(2.0, st + 0.18 * front_band)

    U, sig_raw, V = compute_svd_polar(Fp)
    # Drucker-Prager / bounded stretch clamping with fracture decohesion
    s0 = wp.clamp(sig_raw[0], 0.35, 2.2)
    s1 = wp.clamp(sig_raw[1], 0.35, 2.2)
    s2 = wp.clamp(sig_raw[2], 0.35, 2.2)
    J = s0 * s1 * s2
    sig_mat = wp.diag(wp.vec3(s0, s1, s2))
    Fp_clamped = U * sig_mat * wp.transpose(V)

    # First Piola-Kirchhoff fixed-corotated stress -> Cauchy * vol = dP * F^T
    R = U * wp.transpose(V)
    stress = (2.0 * mu * (Fp_clamped - R) * wp.transpose(Fp_clamped) + wp.identity(n=3, dtype=float) * (la * J * (J - 1.0))) * (-p_vol * 4.0 * dt * inv_dx * inv_dx)

    # Von Mises deviatoric metric -> trigger brittle yield beyond yield_stress
    trace_s = (stress[0, 0] + stress[1, 1] + stress[2, 2]) / 3.0
    dev = wp.sqrt(
        (s0 - s1) * (s0 - s1) + (s1 - s2) * (s1 - s2) + (s2 - s0) * (s2 - s0) + 1e-8
    )
    if dev > yield_stress:
        strain_arr[p] = wp.min(2.0, strain_arr[p] + (dev - yield_stress) * 0.85)
        F[p] = U * wp.diag(wp.vec3(wp.clamp(s0, 0.88, 1.12), wp.clamp(s1, 0.88, 1.12), wp.clamp(s2, 0.88, 1.12))) * wp.transpose(V)

    affine = stress + p_mass * C[p]
    base_coord = wp.vec3i(
        int(wp.floor(xp[0] * inv_dx - 0.5)),
        int(wp.floor(xp[1] * inv_dx - 0.5)),
        int(wp.floor(xp[2] * inv_dx - 0.5)),
    )
    fx = xp * inv_dx - wp.vec3(float(base_coord[0]), float(base_coord[1]), float(base_coord[2]))
    wx = wp.vec3(0.5 * (1.5 - fx[0]) * (1.5 - fx[0]), 0.75 - (fx[0] - 1.0) * (fx[0] - 1.0), 0.5 * (fx[0] - 0.5) * (fx[0] - 0.5))
    wy = wp.vec3(0.5 * (1.5 - fx[1]) * (1.5 - fx[1]), 0.75 - (fx[1] - 1.0) * (fx[1] - 1.0), 0.5 * (fx[1] - 0.5) * (fx[1] - 0.5))
    wz = wp.vec3(0.5 * (1.5 - fx[2]) * (1.5 - fx[2]), 0.75 - (fx[2] - 1.0) * (fx[2] - 1.0), 0.5 * (fx[2] - 0.5) * (fx[2] - 0.5))

    vp = v[p]
    for i in range(3):
        gi = wp.clamp(base_coord[0] + i, 1, grid_res - 2)
        for j in range(3):
            gj = wp.clamp(base_coord[1] + j, 1, grid_res - 2)
            for k in range(3):
                gk = wp.clamp(base_coord[2] + k, 1, grid_res - 2)
                w = wx[i] * wy[j] * wz[k]
                dpos = (wp.vec3(float(i), float(j), float(k)) - fx) * dx
                mom = w * (p_mass * vp + affine * dpos)
                idx = (gi * grid_res + gj) * grid_res + gk
                wp.atomic_add(grid_mv, idx, wp.vec4(mom[0], mom[1], mom[2], w * p_mass))


@wp.kernel
def grid_update_kernel(
    grid_mv: wp.array(dtype=wp.vec4),
    grid_res: int,
    dx: float,
    dt: float,
    gravity_y: float,
    floor_cell_y: float,
    blast_force: float,
    blast_origin: wp.vec3,
    blast_radius: float,
    preset_id: int,
    sim_time: float,
):
    tid = wp.tid()
    node = grid_mv[tid]
    mass = node[3]
    if mass <= 1e-10:
        return

    i = tid // (grid_res * grid_res)
    rem = tid - i * (grid_res * grid_res)
    j = rem // grid_res
    k = rem - j * grid_res

    vel = wp.vec3(node[0], node[1], node[2]) / mass
    vel = vel + wp.vec3(0.0, gravity_y * dt, 0.0)

    pos_w = wp.vec3(float(i), float(j), float(k)) * dx
    if blast_force > 0.0:
        delta = pos_w - blast_origin
        dist = wp.length(delta) + 1e-4
        dir = delta / dist
        if preset_id == 0:
            # Shatter: radial impact wavefront expanding cleanly + upward lift
            band = wp.exp(-((dist - blast_radius) * (dist - blast_radius)) / (dx * dx * 6.0))
            lift = wp.vec3(dir[0] * 1.15, wp.max(0.18, dir[1] * 0.72 + 0.35), dir[2] * 1.15)
            vel = vel + lift * (blast_force * band * dt)
        elif preset_id == 1:
            # Blast: omnidirectional impulse outward from blast_origin
            fall = wp.exp(-dist * 1.8)
            vel = vel + (dir + wp.vec3(0.0, 0.3, 0.0)) * (blast_force * fall * dt)
        elif preset_id == 2:
            # Smoke dissolve: rising buoyant turbulent swirl
            swirl = wp.vec3(-delta[2], 0.0, delta[0])
            buoy = wp.vec3(0.12 * wp.sin(pos_w[1] * 7.0 + sim_time * 4.0), 1.0, 0.12 * wp.cos(pos_w[0] * 7.0 + sim_time * 3.5))
            vel = vel + (buoy * 1.1 + swirl * 1.8) * (blast_force * 0.55 * dt)

    # Bound and floor friction collision (real MPM Coulomb slide/stop on table plane)
    bound = 3
    if i < bound and vel[0] < 0.0:
        vel = wp.vec3(0.0, vel[1], vel[2])
    if i > grid_res - 1 - bound and vel[0] > 0.0:
        vel = wp.vec3(0.0, vel[1], vel[2])
    if k < bound and vel[2] < 0.0:
        vel = wp.vec3(vel[0], vel[1], 0.0)
    if k > grid_res - 1 - bound and vel[2] > 0.0:
        vel = wp.vec3(vel[0], vel[1], 0.0)
    if j > grid_res - 1 - bound and vel[1] > 0.0:
        vel = wp.vec3(vel[0], 0.0, vel[2])

    if float(j) <= floor_cell_y and vel[1] < 0.0:
        vn = vel[1]
        vt = wp.vec3(vel[0], 0.0, vel[2])
        vt_len = wp.length(vt)
        mu_f = 0.42
        if vt_len > 1e-6:
            scale = wp.max(0.0, 1.0 + mu_f * vn / vt_len)
            vel = wp.vec3(vt[0] * scale, -vn * 0.12, vt[2] * scale)
        else:
            vel = wp.vec3(0.0, -vn * 0.12, 0.0)

    # Cap speed cleanly within CFL
    spd = wp.length(vel)
    max_spd = 0.45 * dx / dt
    if spd > max_spd:
        vel = vel * (max_spd / spd)

    grid_mv[tid] = wp.vec4(vel[0], vel[1], vel[2], mass)


@wp.kernel
def g2p_kernel(
    x: wp.array(dtype=wp.vec3),
    v: wp.array(dtype=wp.vec3),
    C: wp.array(dtype=wp.mat33),
    F: wp.array(dtype=wp.mat33),
    strain_arr: wp.array(dtype=float),
    grid_mv: wp.array(dtype=wp.vec4),
    inv_dx: float,
    dx: float,
    dt: float,
    grid_res: int,
    floor_world_y: float,
    wake_radius: float,
    wake_origin: wp.vec3,
    bounds_lo: float,
    bounds_hi: float,
    v_burst: wp.array(dtype=wp.vec3),
    use_voronoi_burst: int,
):
    p = wp.tid()
    xp = x[p]
    if strain_arr[p] < 0.0:
        if wp.length(xp - wake_origin) <= wake_radius:
            if use_voronoi_burst == 1:
                strain_arr[p] = 0.72
                v[p] = v_burst[p]
                return
            else:
                strain_arr[p] = 0.02
        else:
            return

    base_coord = wp.vec3i(
        int(wp.floor(xp[0] * inv_dx - 0.5)),
        int(wp.floor(xp[1] * inv_dx - 0.5)),
        int(wp.floor(xp[2] * inv_dx - 0.5)),
    )
    fx = xp * inv_dx - wp.vec3(float(base_coord[0]), float(base_coord[1]), float(base_coord[2]))
    wx = wp.vec3(0.5 * (1.5 - fx[0]) * (1.5 - fx[0]), 0.75 - (fx[0] - 1.0) * (fx[0] - 1.0), 0.5 * (fx[0] - 0.5) * (fx[0] - 0.5))
    wy = wp.vec3(0.5 * (1.5 - fx[1]) * (1.5 - fx[1]), 0.75 - (fx[1] - 1.0) * (fx[1] - 1.0), 0.5 * (fx[1] - 0.5) * (fx[1] - 0.5))
    wz = wp.vec3(0.5 * (1.5 - fx[2]) * (1.5 - fx[2]), 0.75 - (fx[2] - 1.0) * (fx[2] - 1.0), 0.5 * (fx[2] - 0.5) * (fx[2] - 0.5))

    new_v = wp.vec3(0.0, 0.0, 0.0)
    new_C = wp.mat33(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    for i in range(3):
        gi = wp.clamp(base_coord[0] + i, 1, grid_res - 2)
        for j in range(3):
            gj = wp.clamp(base_coord[1] + j, 1, grid_res - 2)
            for k in range(3):
                gk = wp.clamp(base_coord[2] + k, 1, grid_res - 2)
                w = wx[i] * wy[j] * wz[k]
                dpos = (wp.vec3(float(i), float(j), float(k)) - fx) * dx
                idx = (gi * grid_res + gj) * grid_res + gk
                gv = wp.vec3(grid_mv[idx][0], grid_mv[idx][1], grid_mv[idx][2])
                new_v = new_v + w * gv
                # Outer product gv * dpos^T * 4 * inv_dx^2
                s = w * 4.0 * inv_dx * inv_dx
                new_C = new_C + wp.outer(gv * s, dpos)

    v[p] = new_v
    C[p] = new_C
    F[p] = (wp.identity(n=3, dtype=float) + dt * new_C) * F[p]
    nx = xp + dt * new_v
    if nx[1] < floor_world_y:
        nx = wp.vec3(nx[0], floor_world_y, nx[2])
        if new_v[1] < 0.0:
            v[p] = wp.vec3(new_v[0] * 0.85, 0.0, new_v[2] * 0.85)
    nx = wp.vec3(
        wp.clamp(nx[0], bounds_lo, bounds_hi),
        wp.clamp(nx[1], bounds_lo, bounds_hi),
        wp.clamp(nx[2], bounds_lo, bounds_hi),
    )
    x[p] = nx


def save_subset_ply(ply_in: PlyData, indices: np.ndarray, xyz_override: np.ndarray | None, out_path: Path) -> None:
    vert = ply_in["vertex"].data[indices].copy()
    if xyz_override is not None:
        vert["x"] = xyz_override[:, 0].astype(np.float32)
        vert["y"] = xyz_override[:, 1].astype(np.float32)
        vert["z"] = xyz_override[:, 2].astype(np.float32)
    el = PlyElement.describe(vert, "vertex")
    PlyData([el], text=False).write(str(out_path))


def parse_vec3_list(s: str | None) -> np.ndarray | None:
    if not s:
        return None
    parts = [float(p.strip()) for p in s.split(",")]
    if len(parts) != 3:
        raise ValueError(f"Expected 3 floats, got {s}")
    return np.array(parts, dtype=np.float32)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run NVIDIA Warp MLS-MPM physics/destruction on 3DGS PLY.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", default="/content/physgs_out")
    parser.add_argument("--preset", choices=["shatter", "blast", "smoke_dissolve", "elastic_drop"], default="shatter")
    parser.add_argument("--roi", default="auto", help="auto | all | radius:<r> | sphere:x,y,z,r | box:x0,y0,z0,x1,y1,z1")
    parser.add_argument("--flip-x", action="store_true", help="Apply 180 deg rotation about X (OpenCV Y-down -> +Y-up).")
    parser.add_argument("--up", default=None, help="Optional ux,uy,uz world up normal in raw coordinates after --flip-x.")
    parser.add_argument("--max-particles", type=int, default=160000)
    parser.add_argument("--frames", type=int, default=54)
    parser.add_argument("--fps", type=float, default=15.0)
    parser.add_argument("--grid", type=int, default=64)
    parser.add_argument("--substeps", type=int, default=64)
    parser.add_argument("--device", default="auto", choices=["auto", "cuda:0", "cpu"])
    args, _ = parser.parse_known_args()

    t_total0 = time.perf_counter()
    ply = PlyData.read(args.input)
    vdata = ply["vertex"].data
    total_n = len(vdata)

    raw_xyz = np.stack([vdata["x"], vdata["y"], vdata["z"]], axis=1).astype(np.float32)
    raw_op = 1.0 / (1.0 + np.exp(-np.clip(vdata["opacity"].astype(np.float32), -20.0, 20.0)))

    # Orient into scene world space (+Y up) and apply optional gravity-up tilt alignment
    pts = raw_xyz.copy()
    if args.flip_x:
        pts[:, 1] = -pts[:, 1]
        pts[:, 2] = -pts[:, 2]

    up_vec = parse_vec3_list(args.up)
    rot_mat = np.eye(3, dtype=np.float32)
    if up_vec is not None:
        a = up_vec / max(1e-8, float(np.linalg.norm(up_vec)))
        b = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        v_c = np.cross(a, b)
        c_dot = float(np.dot(a, b))
        if np.linalg.norm(v_c) > 1e-6:
            kmat = np.array([[0, -v_c[2], v_c[1]], [v_c[2], 0, -v_c[0]], [-v_c[1], v_c[0], 0]], dtype=np.float32)
            rot_mat = np.eye(3, dtype=np.float32) + kmat + (kmat @ kmat) / (1.0 + c_dot)
        elif c_dot < 0:
            rot_mat = np.diag([1.0, -1.0, -1.0]).astype(np.float32)
        pts = pts @ rot_mat.T

    # Robust core normalization into canonical simulation box [0.15, 0.85]^3 inside [0, 1]^3 MPM grid
    opaque_mask = (raw_op > 0.15) & np.all(np.isfinite(pts), axis=1)
    core_pts = pts[opaque_mask]
    lo_p = np.percentile(core_pts, 8.0, axis=0)
    hi_p = np.percentile(core_pts, 92.0, axis=0)
    center = 0.5 * (lo_p + hi_p)
    span = float(max(0.25, np.max(hi_p - lo_p)))

    if args.roi == "auto":
        rel = (pts - center) / span
        dist_xz = np.sqrt(rel[:, 0] ** 2 + rel[:, 2] ** 2)
        y_lo = np.percentile(core_pts[:, 1], 18.0)
        hero_mask = (
            opaque_mask
            & (dist_xz < 0.42)
            & (pts[:, 1] > y_lo - 0.05 * span)
            & (rel[:, 1] < 0.65)
        )
        if np.sum(hero_mask) < 15000:
            hero_mask = opaque_mask & (dist_xz < 0.58)
    elif args.roi == "all":
        hero_mask = opaque_mask
    elif args.roi.startswith("radius:"):
        rad = float(args.roi.split(":", 1)[1])
        dist = np.linalg.norm(pts - center, axis=1)
        hero_mask = opaque_mask & (dist <= rad)
    elif args.roi.startswith("sphere:"):
        cx, cy, cz, rad = [float(v) for v in args.roi.replace("sphere:", "").split(",")]
        ref_pt = np.array([cx, cy, cz], dtype=np.float32)
        if args.flip_x:
            ref_pt[1] = -ref_pt[1]
            ref_pt[2] = -ref_pt[2]
        ref_pt = rot_mat @ ref_pt
        dist = np.linalg.norm(pts - ref_pt, axis=1)
        hero_mask = opaque_mask & (dist <= rad)
    else:
        bx = [float(v) for v in args.roi.replace("box:", "").split(",")]
        hero_mask = (
            opaque_mask
            & (pts[:, 0] >= bx[0]) & (pts[:, 0] <= bx[3])
            & (pts[:, 1] >= bx[1]) & (pts[:, 1] <= bx[4])
            & (pts[:, 2] >= bx[2]) & (pts[:, 2] <= bx[5])
        )

    hero_idx = np.nonzero(hero_mask)[0]
    if len(hero_idx) > args.max_particles:
        rng = np.random.default_rng(42)
        hero_idx = np.sort(rng.choice(hero_idx, size=args.max_particles, replace=False))
    if args.roi == "all":
        static_idx = np.empty(0, dtype=np.int64)
    else:
        static_mask = np.ones(total_n, dtype=bool)
        static_mask[hero_idx] = False
        static_idx = np.nonzero(static_mask)[0]

    hero_pts = pts[hero_idx]
    hero_lo = np.percentile(hero_pts, 2.0, axis=0)
    hero_hi = np.percentile(hero_pts, 98.0, axis=0)
    hero_center = 0.5 * (hero_lo + hero_hi)
    hero_extent = float(max(0.2, np.max(hero_hi - hero_lo)))

    # Map hero extent into MPM unit domain centered horizontally at (0.5, y, 0.5)
    # leaving generous headroom/runout inside [0.06, 0.94]^3!
    sim_scale = 0.42 / hero_extent
    floor_world_y = float(np.percentile(hero_pts[:, 1], 3.0))
    sim_offset = np.array([0.5 - hero_center[0] * sim_scale, 0.14 - floor_world_y * sim_scale, 0.5 - hero_center[2] * sim_scale], dtype=np.float32)

    x_init = (hero_pts * sim_scale + sim_offset).astype(np.float32)
    floor_sim_y = 0.14
    n_p = len(x_init)
    grid_res = args.grid
    dx = 1.0 / grid_res
    inv_dx = float(grid_res)
    dt = (1.0 / args.fps) / args.substeps

    preset_id = {"shatter": 0, "blast": 1, "smoke_dissolve": 2, "elastic_drop": 3}[args.preset]
    use_voronoi_burst = 1 if (preset_id == 0 and args.roi == "all") else 0
    E = 120.0 if use_voronoi_burst == 1 else (180.0 if preset_id != 3 else 70.0)
    nu = 0.25
    mu0 = E / (2.0 * (1.0 + nu))
    la0 = E * nu / ((1.0 + nu) * (1.0 - 2.0 * nu))
    p_vol = (dx * 0.5) ** 3
    p_mass = p_vol * 1.0
    gravity_y = -3.8 if use_voronoi_burst == 1 else (-6.5 if preset_id != 2 else 2.2)
    yield_stress = 0.085 if preset_id == 0 else 0.11

    dev = ("cuda:0" if wp.is_cuda_available() else "cpu") if args.device == "auto" else args.device
    x_wp = wp.array(x_init, dtype=wp.vec3, device=dev)
    v_wp = wp.zeros(n_p, dtype=wp.vec3, device=dev)
    C_wp = wp.zeros(n_p, dtype=wp.mat33, device=dev)
    F_init = np.broadcast_to(np.eye(3, dtype=np.float32), (n_p, 3, 3)).copy()
    F_wp = wp.array(F_init, dtype=wp.mat33, device=dev)

    # Start hero particles dormant (-1.0) so an expanding kinetic trigger cracks them cleanly from intact state!
    strain_init = np.full(n_p, -1.0 if preset_id in (0, 1, 2) else 0.0, dtype=np.float32)
    strain_wp = wp.array(strain_init, dtype=float, device=dev)
    grid_mv = wp.zeros(grid_res * grid_res * grid_res, dtype=wp.vec4, device=dev)

    if use_voronoi_burst == 1:
        rng_s = np.random.default_rng(7)
        k_shards = 14
        seeds = x_init[rng_s.choice(n_p, size=k_shards, replace=False)].copy()
        for _ in range(4):
            d2 = np.sum((x_init[:, None, :] - seeds[None, :, :]) ** 2, axis=2)
            shard_ids = np.argmin(d2, axis=1)
            for k in range(k_shards):
                m = shard_ids == k
                if np.any(m):
                    seeds[k] = x_init[m].mean(axis=0)
        d2 = np.sum((x_init[:, None, :] - seeds[None, :, :]) ** 2, axis=2)
        shard_ids = np.argmin(d2, axis=1)

        v_burst_np = np.zeros((n_p, 3), dtype=np.float32)
        for k in range(k_shards):
            m = shard_ids == k
            if not np.any(m):
                continue
            sc = seeds[k]
            rx, rz = float(sc[0] - 0.5), float(sc[2] - 0.5)
            rn = float(np.hypot(rx, rz))
            if rn < 0.015:
                ang = k * 2.399963
                ux, uz = float(np.cos(ang)), float(np.sin(ang))
            else:
                ux, uz = rx / rn, rz / rn
            h_norm = float(np.clip((sc[1] - floor_sim_y) / 0.42, 0.0, 1.0))
            v_rad = float(rng_s.uniform(0.92, 1.48)) * (0.75 + 0.55 * h_norm)
            v_up = 0.34 + 0.74 * h_norm + float(rng_s.uniform(0.0, 0.20))
            base_v = np.array([ux * v_rad, v_up, uz * v_rad], dtype=np.float32)
            omega = rng_s.uniform(-4.2, 4.2, size=3).astype(np.float32)
            rel_p = x_init[m] - sc[None, :]
            spin_v = np.cross(omega[None, :], rel_p).astype(np.float32)
            jitter = rng_s.normal(0.0, 0.015, size=(int(np.sum(m)), 3)).astype(np.float32)
            v_burst_np[m] = base_v[None, :] + spin_v + jitter
        v_burst_np[:, 0] -= v_burst_np[:, 0].mean()
        v_burst_np[:, 2] -= v_burst_np[:, 2].mean()
        v_burst_wp = wp.array(v_burst_np, dtype=wp.vec3, device=dev)
    else:
        v_burst_wp = wp.zeros(n_p, dtype=wp.vec3, device=dev)

    blast_origin = wp.vec3(0.5, 0.34 if args.roi == "all" else 0.25, 0.5)
    frame_positions = np.zeros((args.frames, n_p, 3), dtype=np.float32)
    frame_strains = np.zeros((args.frames, n_p), dtype=np.float32)

    t_sim0 = time.perf_counter()
    for f in range(args.frames):
        frame_positions[f] = (x_wp.numpy() - sim_offset) / sim_scale
        frame_strains[f] = np.clip(strain_wp.numpy(), 0.0, 2.0)

        sim_t = f / args.fps
        if use_voronoi_burst == 1:
            wake_r = 0.03 + sim_t * 0.48
            b_rad = 0.0
            b_force = 0.0
        else:
            wake_r = 0.05 + sim_t * (0.42 if preset_id == 0 else 0.55)
            b_rad = 0.05 + sim_t * (0.34 if preset_id == 0 else 0.45)
            b_force = 24.0 if (preset_id == 0 and sim_t < 2.2) else (16.0 if preset_id in (1, 2) else 0.0)

        for _ in range(args.substeps):
            wp.launch(zero_grid_kernel, dim=grid_res ** 3, inputs=[grid_mv], device=dev)
            wp.launch(
                p2g_kernel,
                dim=n_p,
                inputs=[
                    x_wp, v_wp, C_wp, F_wp, strain_wp, grid_mv,
                    inv_dx, dx, dt, p_vol, p_mass, mu0, la0, yield_stress,
                    grid_res, 1.0 if b_force > 0 else 0.0, blast_origin, b_rad,
                ],
                device=dev,
            )
            wp.launch(
                grid_update_kernel,
                dim=grid_res ** 3,
                inputs=[
                    grid_mv, grid_res, dx, dt, gravity_y, floor_sim_y * inv_dx,
                    b_force, blast_origin, b_rad, preset_id, sim_t,
                ],
                device=dev,
            )
            wp.launch(
                g2p_kernel,
                dim=n_p,
                inputs=[
                    x_wp, v_wp, C_wp, F_wp, strain_wp, grid_mv,
                    inv_dx, dx, dt, grid_res, floor_sim_y,
                    wake_r if preset_id in (0, 1, 2) else 99.0,
                    blast_origin, 3.5 * dx, 1.0 - 3.5 * dx,
                    v_burst_wp, use_voronoi_burst,
                ],
                device=dev,
            )
    wp.synchronize()
    sim_sec = time.perf_counter() - t_sim0

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Write static and dynamic PLYs in original PLY space (so Radix applies its normal Y-down -> +Y-up flip!)
    if len(static_idx) > 0:
        save_subset_ply(ply, static_idx, None, out_dir / "mpm-static.ply")
    save_subset_ply(ply, hero_idx, None, out_dir / "mpm-dynamic.ply")

    # Note: frame_positions were in upright world space (+Y up if flip_x); export upright positions in mpm-traj.bin
    b_min = np.min(frame_positions, axis=(0, 1)).astype(np.float32) - 0.02
    b_max = np.max(frame_positions, axis=(0, 1)).astype(np.float32) + 0.02
    b_span = np.maximum(b_max - b_min, 1e-4).astype(np.float32)

    q_xyz = np.clip(np.round(((frame_positions - b_min) / b_span) * 65535.0), 0, 65535).astype(np.uint16)
    q_st = np.clip(np.round((frame_strains / 2.0) * 65535.0), 0, 65535).astype(np.uint16)
    packed = np.empty((args.frames, n_p, 4), dtype=np.uint16)
    packed[:, :, :3] = q_xyz
    packed[:, :, 3] = q_st

    header = struct.pack(
        "<4sIIIffffffffffff",
        b"MPMT",
        1,
        args.frames,
        n_p,
        float(args.fps),
        float(b_min[0]), float(b_min[1]), float(b_min[2]),
        float(b_max[0]), float(b_max[1]), float(b_max[2]),
        float(floor_world_y),
        float(len(static_idx)),
        0.0, 0.0, 0.0,
    )
    traj_path = out_dir / "mpm-traj.bin"
    with traj_path.open("wb") as f:
        f.write(header)
        f.write(packed.tobytes(order="C"))

    final_disp = np.linalg.norm(frame_positions[-1] - frame_positions[0], axis=1)
    gpu_name = getattr(wp.get_device(dev), "name", str(dev))
    meta = {
        "backend": "nvidia-warp-cuda-mpm",
        "warp_version": wp.__version__,
        "gpu_name": gpu_name,
        "preset": args.preset,
        "total_input_splats": total_n,
        "num_particles": n_p,
        "static_particles": int(len(static_idx)),
        "grid_res": grid_res,
        "substeps": args.substeps,
        "frames": args.frames,
        "fps": args.fps,
        "sim_sec": round(sim_sec, 3),
        "ms_per_frame": round((sim_sec * 1000.0) / max(args.frames, 1), 2),
        "wall_sec": round(time.perf_counter() - t_total0, 3),
        "mean_final_disp": round(float(np.mean(final_disp)), 4),
        "max_final_disp": round(float(np.max(final_disp)), 4),
        "peak_strain": round(float(np.max(frame_strains)), 4),
        "traj_bytes": traj_path.stat().st_size,
        "bounds_min": b_min.tolist(),
        "bounds_max": b_max.tolist(),
        "floor_y": floor_world_y,
        "flip_x": bool(args.flip_x),
        "up": up_vec.tolist() if up_vec is not None else None,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("[colab-physgs-mpm] SUMMARY:", json.dumps(meta, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
