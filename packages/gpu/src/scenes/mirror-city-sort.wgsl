struct SortParams {
  k: u32,
  j: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> sortParams: SortParams;
@group(0) @binding(1) var<storage, read_write> keys: array<u32>;
@group(0) @binding(2) var<storage, read_write> indices: array<u32>;

var<workgroup> localKeys: array<u32, 512>;
var<workgroup> localIndices: array<u32, 512>;

@compute @workgroup_size(256)
fn cs_local_sort(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wgId: vec3u,
) {
  let tid = lid.x;
  let base = wgId.x * 512u;
  localKeys[tid] = keys[base + tid];
  localKeys[tid + 256u] = keys[base + tid + 256u];
  localIndices[tid] = indices[base + tid];
  localIndices[tid + 256u] = indices[base + tid + 256u];
  workgroupBarrier();

  for (var k = 2u; k <= 512u; k <<= 1u) {
    for (var j = k >> 1u; j > 0u; j >>= 1u) {
      let a = (tid / j) * (2u * j) + (tid % j);
      let b = a + j;
      let ga = base + a;
      let wantAsc = (ga & k) == 0u;
      let ka = localKeys[a];
      let kb = localKeys[b];
      let swapAsc = ka > kb;
      let swapDesc = ka < kb;
      if (select(swapDesc, swapAsc, wantAsc)) {
        localKeys[a] = kb;
        localKeys[b] = ka;
        let ia = localIndices[a];
        localIndices[a] = localIndices[b];
        localIndices[b] = ia;
      }
      workgroupBarrier();
    }
  }

  keys[base + tid] = localKeys[tid];
  keys[base + tid + 256u] = localKeys[tid + 256u];
  indices[base + tid] = localIndices[tid];
  indices[base + tid + 256u] = localIndices[tid + 256u];
}

@compute @workgroup_size(256)
fn cs_global_step(@builtin(global_invocation_id) gid: vec3u) {
  let p = gid.x;
  let j = sortParams.j;
  let k = sortParams.k;
  let i1 = (p / j) * (2u * j) + (p % j);
  let i2 = i1 + j;
  if (i2 >= arrayLength(&keys)) {
    return;
  }

  let wantAsc = (i1 & k) == 0u;
  let k1 = keys[i1];
  let k2 = keys[i2];
  let swapAsc = k1 > k2;
  let swapDesc = k1 < k2;
  if (select(swapDesc, swapAsc, wantAsc)) {
    keys[i1] = k2;
    keys[i2] = k1;
    let idx1 = indices[i1];
    indices[i1] = indices[i2];
    indices[i2] = idx1;
  }
}

@compute @workgroup_size(256)
fn cs_local_merge(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wgId: vec3u,
) {
  let tid = lid.x;
  let base = wgId.x * 512u;
  localKeys[tid] = keys[base + tid];
  localKeys[tid + 256u] = keys[base + tid + 256u];
  localIndices[tid] = indices[base + tid];
  localIndices[tid + 256u] = indices[base + tid + 256u];
  workgroupBarrier();

  let k = sortParams.k;
  let wantAsc = (base & k) == 0u;
  for (var j = 256u; j > 0u; j >>= 1u) {
    let a = (tid / j) * (2u * j) + (tid % j);
    let b = a + j;
    let ka = localKeys[a];
    let kb = localKeys[b];
    let swapAsc = ka > kb;
    let swapDesc = ka < kb;
    if (select(swapDesc, swapAsc, wantAsc)) {
      localKeys[a] = kb;
      localKeys[b] = ka;
      let ia = localIndices[a];
      localIndices[a] = localIndices[b];
      localIndices[b] = ia;
    }
    workgroupBarrier();
  }

  keys[base + tid] = localKeys[tid];
  keys[base + tid + 256u] = localKeys[tid + 256u];
  indices[base + tid] = localIndices[tid];
  indices[base + tid + 256u] = localIndices[tid + 256u];
}
