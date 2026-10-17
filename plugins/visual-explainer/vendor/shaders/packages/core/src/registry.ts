/**
 * Shader Registry - imports all shader definitions
 *
 * Import from 'shaders-core/registry' to access the full shader registry.
 * Note: This will bundle all shader definitions into your app.
 * Only import this if you need dynamic access to all shaders.
 */

export {
  shaderRegistry,
  getAllShaders,
  getShaderByName,
  getShadersByCategory,
  getShaderCategories
} from './shaderRegistry'

export type { ShaderRegistryEntry } from './shaderRegistry'
