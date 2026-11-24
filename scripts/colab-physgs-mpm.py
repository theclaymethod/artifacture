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
def transform_rigid_shards_kernel(
    x_local: wp.array(dtype=wp.vec3),
    shard_id: wp.array(dtype=int),
    shard_pos: wp.array(dtype=wp.vec3),
    shard_quat: wp.array(dtype=wp.vec4),
    shard_awake: wp.array(dtype=float),
    splinter_pos: wp.array(dtype=wp.vec3),
    splinter_strain: wp.array(dtype=float),
    out_pos: wp.array(dtype=wp.vec3),
    out_strain: wp.array(dtype=float),
):
    p = wp.tid()
    sid = shard_id[p]
    if sid >= 65535 or sid < 0:
        out_pos[p] = splinter_pos[p]
        out_strain[p] = splinter_strain[p]
        return
    q = shard_quat[sid]
    qx = q[0]
    qy = q[1]
    qz = q[2]
    qw = q[3]
    v = x_local[p]
    uv_x = qy * v[2] - qz * v[1]
    uv_y = qz * v[0] - qx * v[2]
    uv_z = qx * v[1] - qy * v[0]
    uuv_x = qy * uv_z - qz * uv_y
    uuv_y = qz * uv_x - qx * uv_z
    uuv_z = qx * uv_y - qy * uv_x
    rot_v = v + 2.0 * qw * wp.vec3(uv_x, uv_y, uv_z) + 2.0 * wp.vec3(uuv_x, uuv_y, uuv_z)
    out_pos[p] = shard_pos[sid] + rot_v
    out_strain[p] = shard_awake[sid]


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


def quat_mul_np(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ax, ay, az, aw = float(a[0]), float(a[1]), float(a[2]), float(a[3])
    bx, by, bz, bw = float(b[0]), float(b[1]), float(b[2]), float(b[3])
    out = np.array([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ], dtype=np.float32)
    n = float(np.linalg.norm(out))
    return out / n if n > 1e-8 else np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float32)


def quat_to_rot_np(q: np.ndarray) -> np.ndarray:
    x, y, z, w = float(q[0]), float(q[1]), float(q[2]), float(q[3])
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return np.array([
        [1.0 - 2.0 * (yy + zz), 2.0 * (xy - wz), 2.0 * (xz + wy)],
        [2.0 * (xy + wz), 1.0 - 2.0 * (xx + zz), 2.0 * (yz - wx)],
        [2.0 * (xz - wy), 2.0 * (yz + wx), 1.0 - 2.0 * (xx + yy)],
    ], dtype=np.float32)


def solve_rigid_voronoi_shatter(
    hero_pts: np.ndarray,
    floor_world_y: float,
    hero_extent: float,
    frames: int,
    fps: float,
    substeps: int,
    dev: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, float]:
    n_p = len(hero_pts)
    k_shards = 28
    rng = np.random.default_rng(17)

    # Jagged crystal warp for authentic fractured rock/jade planes
    warp_scale = 0.016 * max(0.35, hero_extent)
    warped = hero_pts + warp_scale * np.stack([
        np.sin(hero_pts[:, 1] * 38.0) * np.cos(hero_pts[:, 2] * 31.0),
        np.sin(hero_pts[:, 2] * 35.0) * np.cos(hero_pts[:, 0] * 38.0),
        np.sin(hero_pts[:, 0] * 31.0) * np.cos(hero_pts[:, 1] * 35.0),
    ], axis=1).astype(np.float32)

    seeds = warped[rng.choice(n_p, size=k_shards, replace=False)].copy()
    for _ in range(4):
        d2 = np.sum((warped[:, None, :] - seeds[None, :, :]) ** 2, axis=2)
        vor_ids = np.argmin(d2, axis=1)
        for k in range(k_shards):
            m = vor_ids == k
            if np.any(m):
                seeds[k] = warped[m].mean(axis=0)

    d2 = np.sum((warped[:, None, :] - seeds[None, :, :]) ** 2, axis=2)
    vor_ids = np.argmin(d2, axis=1).astype(np.int32)
    d2_two = np.partition(d2, 1, axis=1)[:, :2]
    seam_gap = d2_two[:, 1] - d2_two[:, 0]
    seam_thresh = 0.0045 * max(0.4, hero_extent ** 2)
    splinter_mask = seam_gap < seam_thresh
    if float(np.mean(splinter_mask)) > 0.11:
        splinter_mask = seam_gap < float(np.percentile(seam_gap, 9.0))
    if float(np.mean(splinter_mask)) < 0.04:
        splinter_mask = seam_gap < float(np.percentile(seam_gap, 7.5))

    shard_ids_np = vor_ids.copy()
    shard_ids_np[splinter_mask] = 65535

    # Fibonacci unit directions for 32-vertex extremal contact hulls per chunk
    fib_idx = np.arange(32, dtype=np.float32)
    fib_y = 1.0 - (fib_idx / 31.0) * 2.0
    fib_r = np.sqrt(np.maximum(0.0, 1.0 - fib_y * fib_y))
    fib_theta = np.pi * (3.0 - np.sqrt(5.0)) * fib_idx
    fib_dirs = np.stack([np.cos(fib_theta) * fib_r, fib_y, np.sin(fib_theta) * fib_r], axis=1).astype(np.float32)

    coms = np.zeros((k_shards, 3), dtype=np.float32)
    masses = np.ones(k_shards, dtype=np.float32)
    inertias = np.ones(k_shards, dtype=np.float32) * 0.01
    r_rms = np.ones(k_shards, dtype=np.float32) * 0.05
    hulls = np.zeros((k_shards, 32, 3), dtype=np.float32)
    x_local = np.zeros((n_p, 3), dtype=np.float32)

    for k in range(k_shards):
        m = shard_ids_np == k
        if not np.any(m):
            continue
        pts_k = hero_pts[m]
        c_k = pts_k.mean(axis=0)
        loc_k = pts_k - c_k[None, :]
        x_local[m] = loc_k
        coms[k] = c_k
        m_k = float(len(pts_k))
        masses[k] = m_k
        rms = float(np.sqrt(np.mean(np.sum(loc_k * loc_k, axis=1))))
        r_rms[k] = max(0.03, rms)
        inertias[k] = 0.4 * m_k * (max(0.035, rms) ** 2)
        proj = loc_k @ fib_dirs.T
        best_v = np.argmax(proj, axis=0)
        hulls[k] = loc_k[best_v]

    impact_pt = np.array([0.0, 0.04, 0.02], dtype=np.float32)
    wake_t = 0.04 + 0.42 * np.linalg.norm(coms - impact_pt[None, :], axis=1)
    vel0 = np.zeros((k_shards, 3), dtype=np.float32)
    omega0 = np.zeros((k_shards, 3), dtype=np.float32)

    for k in range(k_shards):
        rx = float(coms[k, 0] - impact_pt[0])
        rz = float(coms[k, 2] - impact_pt[2])
        rn = float(np.hypot(rx, rz))
        if rn < 0.018:
            ang = k * 2.3999632
            ux, uz = float(np.cos(ang)), float(np.sin(ang))
        else:
            ux, uz = rx / rn, rz / rn
        h_norm = float(np.clip((coms[k, 1] - floor_world_y) / max(0.25, hero_extent), 0.0, 1.0))
        v_rad = float(rng.uniform(0.42, 0.92)) * (0.75 + 0.55 * h_norm)
        v_up = 0.48 + 0.92 * h_norm + float(rng.uniform(0.0, 0.32))
        vel0[k] = np.array([ux * v_rad, v_up, uz * v_rad], dtype=np.float32)
        peel_axis = np.array([-uz, 0.0, ux], dtype=np.float32) + rng.normal(0.0, 0.32, size=3).astype(np.float32)
        pn = float(np.linalg.norm(peel_axis))
        peel_axis = peel_axis / pn if pn > 1e-5 else np.array([1.0, 0.0, 0.0], dtype=np.float32)
        omega0[k] = peel_axis * float(rng.uniform(3.5, 9.0))

    total_mass = float(np.sum(masses))
    vel0[:, 0] -= float(np.sum(masses * vel0[:, 0])) / total_mass
    vel0[:, 2] -= float(np.sum(masses * vel0[:, 2])) / total_mass

    # Ballistic seam splinters
    spl_idx = np.nonzero(splinter_mask)[0]
    spl_pts0 = hero_pts[spl_idx].copy()
    spl_pos = spl_pts0.copy()
    spl_vel = np.zeros_like(spl_pos)
    spl_wake = 0.02 + 0.42 * np.linalg.norm(spl_pts0 - impact_pt[None, :], axis=1)
    for ii in range(len(spl_idx)):
        rx = float(spl_pts0[ii, 0] - impact_pt[0])
        rz = float(spl_pts0[ii, 2] - impact_pt[2])
        rn = float(np.hypot(rx, rz))
        if rn < 0.015:
            ang = ii * 2.3999632
            ux, uz = float(np.cos(ang)), float(np.sin(ang))
        else:
            ux, uz = rx / rn, rz / rn
        h_norm = float(np.clip((spl_pts0[ii, 1] - floor_world_y) / max(0.25, hero_extent), 0.0, 1.0))
        vr = float(rng.uniform(0.55, 1.35)) * (0.7 + 0.5 * h_norm)
        vu = 0.52 + 0.95 * h_norm + float(rng.uniform(0.0, 0.45))
        spl_vel[ii] = np.array([ux * vr + rng.normal(0.0, 0.14), vu, uz * vr + rng.normal(0.0, 0.14)], dtype=np.float32)

    pos = coms.copy()
    vel = np.zeros_like(pos)
    omega = np.zeros_like(pos)
    quats = np.tile(np.array([0.0, 0.0, 0.0, 1.0], dtype=np.float32), (k_shards, 1))
    awake = np.zeros(k_shards, dtype=np.float32)

    splinter_pos_all = hero_pts.copy()
    splinter_strain_all = np.zeros(n_p, dtype=np.float32)

    x_local_wp = wp.array(x_local, dtype=wp.vec3, device=dev)
    shard_id_wp = wp.array(shard_ids_np, dtype=int, device=dev)
    splinter_pos_wp = wp.zeros(n_p, dtype=wp.vec3, device=dev)
    splinter_strain_wp = wp.zeros(n_p, dtype=float, device=dev)
    out_pos_wp = wp.zeros(n_p, dtype=wp.vec3, device=dev)
    out_strain_wp = wp.zeros(n_p, dtype=float, device=dev)

    frame_positions = np.zeros((frames, n_p, 3), dtype=np.float32)
    frame_strains = np.zeros((frames, n_p), dtype=np.float32)
    shard_quats_out = np.zeros((frames, k_shards, 4), dtype=np.float32)

    gravity_y = -5.8
    dt = (1.0 / fps) / substeps
    sim_time = 0.0
    t_sim0 = time.perf_counter()

    for f in range(frames):
        for k in range(k_shards):
            qk = quats[k].copy()
            if f > 0 and float(np.dot(shard_quats_out[f - 1, k], qk)) < 0.0:
                qk = -qk
            shard_quats_out[f, k] = qk

        shard_pos_wp = wp.array(pos.astype(np.float32), dtype=wp.vec3, device=dev)
        shard_quat_wp = wp.array(shard_quats_out[f].astype(np.float32), dtype=wp.vec4, device=dev)
        shard_awake_wp = wp.array(awake.astype(np.float32), dtype=float, device=dev)
        if len(spl_idx) > 0:
            splinter_pos_all[spl_idx] = spl_pos
            splinter_strain_all[spl_idx] = np.where(sim_time >= spl_wake, 1.65, 0.0).astype(np.float32)
        wp.copy(splinter_pos_wp, wp.array(splinter_pos_all, dtype=wp.vec3, device="cpu"))
        wp.copy(splinter_strain_wp, wp.array(splinter_strain_all, dtype=float, device="cpu"))

        wp.launch(
            transform_rigid_shards_kernel,
            dim=n_p,
            inputs=[x_local_wp, shard_id_wp, shard_pos_wp, shard_quat_wp, shard_awake_wp, splinter_pos_wp, splinter_strain_wp, out_pos_wp, out_strain_wp],
            device=dev,
        )
        frame_positions[f] = out_pos_wp.numpy()
        frame_strains[f] = out_strain_wp.numpy()

        for _ in range(substeps):
            sim_time += dt
            for k in range(k_shards):
                if awake[k] == 0.0:
                    if sim_time >= wake_t[k]:
                        awake[k] = 0.35
                        vel[k] = vel0[k]
                        omega[k] = omega0[k]
                    continue

                vel[k, 1] += gravity_y * dt
                pos[k] += vel[k] * dt
                w_mag = float(np.linalg.norm(omega[k]))
                if w_mag > 1e-6:
                    ang = w_mag * dt
                    ax = omega[k] / w_mag
                    s2 = float(np.sin(0.5 * ang))
                    dq = np.array([ax[0] * s2, ax[1] * s2, ax[2] * s2, float(np.cos(0.5 * ang))], dtype=np.float32)
                    quats[k] = quat_mul_np(dq, quats[k])

                # Multi-vertex hull contact with floor_world_y
                R_k = quat_to_rot_np(quats[k])
                world_v = pos[k][None, :] + (hulls[k] @ R_k.T)
                pens = floor_world_y - world_v[:, 1]
                hit = pens > 0.0
                if np.any(hit):
                    pos[k, 1] += float(np.max(pens))
                    world_v = pos[k][None, :] + (hulls[k] @ R_k.T)
                    r_arm = np.mean(world_v[hit], axis=0) - pos[k]
                    v_c = vel[k] + np.cross(omega[k], r_arm)
                    if v_c[1] < 0.0:
                        n_dir = np.array([0.0, 1.0, 0.0], dtype=np.float32)
                        rn_vec = np.cross(r_arm, n_dir)
                        denom_n = (1.0 / masses[k]) + float(np.dot(rn_vec, rn_vec)) / inertias[k]
                        e_rest = 0.34 if abs(float(v_c[1])) >= 0.22 else 0.0
                        jn = -(1.0 + e_rest) * float(v_c[1]) / denom_n
                        j_vec = jn * n_dir
                        vel[k] += j_vec / masses[k]
                        omega[k] += np.cross(r_arm, j_vec) / inertias[k]

                        v_after = vel[k] + np.cross(omega[k], r_arm)
                        vt = np.array([v_after[0], 0.0, v_after[2]], dtype=np.float32)
                        vt_len = float(np.linalg.norm(vt))
                        if vt_len > 1e-6:
                            t_dir = vt / vt_len
                            rt_vec = np.cross(r_arm, t_dir)
                            denom_t = (1.0 / masses[k]) + float(np.dot(rt_vec, rt_vec)) / inertias[k]
                            jt = min(0.50 * jn, vt_len / denom_t)
                            jt_vec = -jt * t_dir
                            vel[k] += jt_vec / masses[k]
                            omega[k] += np.cross(r_arm, jt_vec) / inertias[k]
                    vel[k, 0] *= 0.996
                    vel[k, 2] *= 0.996
                    omega[k] *= 0.965

            # Pairwise chunk-chunk repulsion
            for i in range(k_shards):
                if awake[i] == 0.0:
                    continue
                for j in range(i + 1, k_shards):
                    if awake[j] == 0.0:
                        continue
                    diff = pos[j] - pos[i]
                    dist = float(np.linalg.norm(diff))
                    min_d = 0.68 * (r_rms[i] + r_rms[j])
                    if 1e-5 < dist < min_d:
                        nrm = diff / dist
                        ov = min_d - dist
                        wi = 1.0 / masses[i]
                        wj = 1.0 / masses[j]
                        wsum = wi + wj
                        pos[i] -= nrm * (ov * wi / wsum)
                        pos[j] += nrm * (ov * wj / wsum)
                        vrel = float(np.dot(vel[j] - vel[i], nrm))
                        if vrel < 0.0:
                            imp = -1.35 * vrel / wsum
                            vel[i] -= (imp * wi) * nrm
                            vel[j] += (imp * wj) * nrm

            # Update ballistic crack-seam splinters
            if len(spl_idx) > 0:
                act = sim_time >= spl_wake
                if np.any(act):
                    spl_vel[act, 1] += gravity_y * dt
                    spl_pos[act] += spl_vel[act] * dt
                    floor_hit = act & (spl_pos[:, 1] < floor_world_y)
                    if np.any(floor_hit):
                        spl_pos[floor_hit, 1] = floor_world_y
                        bounce = floor_hit & (spl_vel[:, 1] < 0.0)
                        spl_vel[bounce, 1] = np.where(np.abs(spl_vel[bounce, 1]) > 0.25, -0.40 * spl_vel[bounce, 1], 0.0)
                        spl_vel[bounce, 0] *= 0.80
                        spl_vel[bounce, 2] *= 0.80

    wp.synchronize()
    sim_sec = time.perf_counter() - t_sim0
    return frame_positions, frame_strains, shard_ids_np.astype(np.uint16), shard_quats_out, sim_sec


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
    dev = ("cuda:0" if wp.is_cuda_available() else "cpu") if args.device == "auto" else args.device

    shard_ids_np: np.ndarray | None = None
    shard_quats_np: np.ndarray | None = None
    if preset_id == 0 and args.roi == "all":
        frame_positions, frame_strains, shard_ids_np, shard_quats_np, sim_sec = solve_rigid_voronoi_shatter(
            hero_pts, floor_world_y, hero_extent, args.frames, args.fps, args.substeps, dev
        )
    else:
        E = 180.0 if preset_id != 3 else 70.0
        nu = 0.25
        mu0 = E / (2.0 * (1.0 + nu))
        la0 = E * nu / ((1.0 + nu) * (1.0 - 2.0 * nu))
        p_vol = (dx * 0.5) ** 3
        p_mass = p_vol * 1.0
        gravity_y = -6.5 if preset_id != 2 else 2.2
        yield_stress = 0.085 if preset_id == 0 else 0.11

        x_wp = wp.array(x_init, dtype=wp.vec3, device=dev)
        v_wp = wp.zeros(n_p, dtype=wp.vec3, device=dev)
        C_wp = wp.zeros(n_p, dtype=wp.mat33, device=dev)
        F_init = np.broadcast_to(np.eye(3, dtype=np.float32), (n_p, 3, 3)).copy()
        F_wp = wp.array(F_init, dtype=wp.mat33, device=dev)

        # Start hero particles dormant (-1.0) so an expanding kinetic trigger cracks them cleanly from intact state!
        strain_init = np.full(n_p, -1.0 if preset_id in (0, 1, 2) else 0.0, dtype=np.float32)
        strain_wp = wp.array(strain_init, dtype=float, device=dev)
        grid_mv = wp.zeros(grid_res * grid_res * grid_res, dtype=wp.vec4, device=dev)
        v_burst_wp = wp.zeros(n_p, dtype=wp.vec3, device=dev)

        blast_origin = wp.vec3(0.5, 0.25, 0.5)
        frame_positions = np.zeros((args.frames, n_p, 3), dtype=np.float32)
        frame_strains = np.zeros((args.frames, n_p), dtype=np.float32)

        t_sim0 = time.perf_counter()
        for f in range(args.frames):
            frame_positions[f] = (x_wp.numpy() - sim_offset) / sim_scale
            frame_strains[f] = np.clip(strain_wp.numpy(), 0.0, 2.0)

            sim_t = f / args.fps
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
                        v_burst_wp, 0,
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

    if shard_ids_np is not None and shard_quats_np is not None:
        rigid_path = out_dir / "mpm-rigid.bin"
        k_sh = int(shard_quats_np.shape[1])
        id_bytes = shard_ids_np.astype(np.uint16).tobytes(order="C")
        pad = b"\x00\x00" if (len(id_bytes) % 4) != 0 else b""
        with rigid_path.open("wb") as rf:
            rf.write(struct.pack("<4sIII", b"RSHD", args.frames, k_sh, n_p))
            rf.write(id_bytes)
            if pad:
                rf.write(pad)
            rf.write(shard_quats_np.astype(np.float32).tobytes(order="C"))

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
        "has_rigid_quats": bool(shard_ids_np is not None),
        "num_shards": int(shard_quats_np.shape[1]) if shard_quats_np is not None else 0,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("[colab-physgs-mpm] SUMMARY:", json.dumps(meta, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
