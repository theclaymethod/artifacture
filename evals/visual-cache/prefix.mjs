import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../lib/canonical-json.mjs';

const ALLOWED_DETAIL = new Set(['low', 'high', 'original']);

export async function buildPrefixManifest({
  provider,
  model,
  systemText,
  sharedInstructions,
  designSystemText = '',
  toolsJson = '[]',
  images,
}) {
  if (!provider) throw new Error('provider is required');
  if (!model) throw new Error('model is required');
  if (!systemText) throw new Error('systemText is required');
  if (!sharedInstructions) throw new Error('sharedInstructions is required');
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('at least one image is required');
  }

  const seenIds = new Set();
  const imageRecords = [];
  for (const image of images) {
    if (!image?.id || !image?.path) throw new Error('every image requires id and path');
    if (seenIds.has(image.id)) throw new Error(`duplicate image id: ${image.id}`);
    seenIds.add(image.id);
    const detail = image.detail || 'high';
    if (!ALLOWED_DETAIL.has(detail)) throw new Error(`unsupported image detail: ${detail}`);
    const bytes = await fs.readFile(image.path);
    imageRecords.push({
      id: image.id,
      basename: path.basename(image.path),
      detail,
      bytes: bytes.byteLength,
      sha256: digest(bytes),
    });
  }

  // Stable state ids, not filesystem enumeration order, define image order.
  imageRecords.sort((a, b) => a.id.localeCompare(b.id));

  const identity = {
    schema_version: 1,
    provider,
    model,
    tools_sha256: digest(toolsJson),
    system_sha256: digest(systemText),
    shared_instructions_sha256: digest(sharedInstructions),
    design_system_sha256: digest(designSystemText),
    images: imageRecords,
  };
  return {
    prefix_id: digest(canonicalJson(identity)),
    ...identity,
  };
}

export function attachCriterionSuffix(prefixManifest, {
  pass,
  criteria,
  prompt,
}) {
  if (!prefixManifest?.prefix_id) throw new Error('prefixManifest is required');
  if (!pass) throw new Error('pass is required');
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new Error('at least one criterion is required');
  }
  if (!prompt) throw new Error('prompt is required');
  return {
    prefix_id: prefixManifest.prefix_id,
    pass,
    criteria: [...criteria].sort(),
    suffix_sha256: digest(prompt),
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
