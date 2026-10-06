/**
 * Decode a preview definition (simple XOR + Base64, no name mapping).
 * Preview definitions are version-proof — they use readable JSON
 * instead of index-based name mapping.
 */

const PREVIEW_KEY = 'shaders-preview-key'

function xorCrypt(data: Uint8Array, key: string): Uint8Array {
  const keyBytes = new TextEncoder().encode(key)
  const result = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ keyBytes[i % keyBytes.length]
  }
  return result
}

export function decodePreviewDefinition(encoded: string): Record<string, unknown> {
  try {
    const binaryString = atob(encoded)
    const encrypted = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      encrypted[i] = binaryString.charCodeAt(i)
    }
    const decrypted = xorCrypt(encrypted, PREVIEW_KEY)
    const json = new TextDecoder().decode(decrypted)
    const result = JSON.parse(json)
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
      throw new Error('unexpected shape')
    }
    return result
  } catch {
    throw new Error('Failed to decode preview definition: invalid data')
  }
}
