export interface SplatLoadOptions {
  /** Number of splats to allocate (rounded/clamped to power-of-2 targetCount). */
  readonly targetCount: number;
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;
const SPLAT_RECORD_BYTES = 32;
const FLOATS_PER_SEED = 16;

function hashBlock(bx: number, bz: number): number {
  const n = Math.sin(bx * 127.1 + bz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength < 2 || bytes[0] !== GZIP_MAGIC_0 || bytes[1] !== GZIP_MAGIC_1) {
    return bytes;
  }
  if (typeof DecompressionStream === 'function') {
    const bodyBytes = new Uint8Array(bytes.byteLength);
    bodyBytes.set(bytes);
    const stream = new Blob([bodyBytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const decompressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(decompressed);
  }
  const { gunzipSync } = await import('node:zlib');
  return new Uint8Array(gunzipSync(bytes));
}

/**
 * Parse a standard 32-byte `.splat` buffer into the GPU `RealSplatSeed` layout
 * (64 bytes per splat: `posOpacity`, `scaleMeta`, `quat`, `colorHeight`).
 */
export function parseSplatBuffer(
  raw: ArrayBuffer | Uint8Array,
  targetCount: number,
): Float32Array<ArrayBuffer> {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const availRecords = Math.floor(bytes.byteLength / SPLAT_RECORD_BYTES);
  const count = Math.min(targetCount, availRecords);

  const out = new Float32Array(new ArrayBuffer(targetCount * FLOATS_PER_SEED * 4));
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * SPLAT_RECORD_BYTES);

  for (let i = 0; i < count; i++) {
    const src = i * SPLAT_RECORD_BYTES;
    const dst = i * FLOATS_PER_SEED;

    const x = view.getFloat32(src + 0, true);
    const y = view.getFloat32(src + 4, true);
    const z = view.getFloat32(src + 8, true);

    const sx = view.getFloat32(src + 12, true);
    const sy = view.getFloat32(src + 16, true);
    const sz = view.getFloat32(src + 20, true);

    const r = bytes[src + 24] / 255;
    const g = bytes[src + 25] / 255;
    const b = bytes[src + 26] / 255;
    const alpha = bytes[src + 27] / 255;

    // Standard .splat quaternion byte order: (w, x, y, z) mapped around 128
    const qwRaw = (bytes[src + 28] - 128) / 128;
    const qxRaw = (bytes[src + 29] - 128) / 128;
    const qyRaw = (bytes[src + 30] - 128) / 128;
    const qzRaw = (bytes[src + 31] - 128) / 128;
    const qLen = Math.hypot(qxRaw, qyRaw, qzRaw, qwRaw) || 1;

    const bx = Math.floor(x / 10.5);
    const bz = Math.floor(z / 10.5);
    const blockHash = hashBlock(bx, bz);
    const heightNorm = Math.max(0, Math.min(1, y / 28));

    // posOpacity
    out[dst + 0] = x;
    out[dst + 1] = y;
    out[dst + 2] = z;
    out[dst + 3] = alpha;

    // scaleMeta: (sx, sy, sz, blockHash)
    out[dst + 4] = sx;
    out[dst + 5] = sy;
    out[dst + 6] = sz;
    out[dst + 7] = blockHash;

    // quat: (qx, qy, qz, qw)
    out[dst + 8] = qxRaw / qLen;
    out[dst + 9] = qyRaw / qLen;
    out[dst + 10] = qzRaw / qLen;
    out[dst + 11] = qwRaw / qLen;

    // colorHeight: (r, g, b, heightNorm)
    out[dst + 12] = r;
    out[dst + 13] = g;
    out[dst + 14] = b;
    out[dst + 15] = heightNorm;
  }

  return out;
}

/**
 * Load a `.splat` or `.splat.gz` asset from an in-memory buffer, browser URL, or Node file path.
 */
export async function loadSplatSource(
  source: string | ArrayBuffer | Uint8Array,
  targetCount: number,
): Promise<Float32Array<ArrayBuffer>> {
  let rawBytes: Uint8Array;
  if (typeof source !== 'string') {
    rawBytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  } else if (
    typeof window !== 'undefined' ||
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('data:') ||
    source.startsWith('blob:')
  ) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to fetch splat source ${source}: ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      throw new Error(`Expected binary .splat/.splat.gz from ${source}, received text/html`);
    }
    rawBytes = new Uint8Array(await res.arrayBuffer());
  } else {
    const { readFile } = await import('node:fs/promises');
    const fileBuf = await readFile(source);
    rawBytes = new Uint8Array(fileBuf.buffer, fileBuf.byteOffset, fileBuf.byteLength);
  }

  const unpacked = await gunzipIfNeeded(rawBytes);
  if (unpacked.byteLength < SPLAT_RECORD_BYTES) {
    throw new Error(
      `Invalid splat payload (${unpacked.byteLength} bytes, expected >= ${SPLAT_RECORD_BYTES} bytes)`,
    );
  }
  const head = new TextDecoder()
    .decode(unpacked.subarray(0, Math.min(16, unpacked.byteLength)))
    .trimStart()
    .toLowerCase();
  if (head.startsWith('<!') || head.startsWith('<html')) {
    throw new Error('Expected binary .splat data but received HTML document');
  }
  return parseSplatBuffer(unpacked, targetCount);
}
