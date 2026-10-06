import type { MaskConfig } from './types'

/**
 * Node information for mask dependency resolution
 */
interface MaskNodeInfo {
  id: string
  parentId: string | null
  elementId?: string
  mask?: MaskConfig
  renderOrder: number
}

/**
 * Result of mask dependency resolution containing processing order
 */
export interface MaskResolutionResult {
  /**
   * Ordered list of node IDs to process for mask calculation
   */
  processingOrder: string[]
  
  /**
   * Map of node IDs to their mask source node IDs
   */
  maskSources: Map<string, string>
  
  /**
   * Any circular dependencies detected during resolution
   */
  circularDependencies: string[][]
}

/**
 * Resolves mask dependencies and determines the correct order for mask processing
 * 
 * @param nodes - All nodes in the scene
 * @returns Mask resolution result with processing order and dependencies
 */
export function resolveMaskDependencies(nodes: Map<string, MaskNodeInfo>): MaskResolutionResult {
  // Lookup table to map element IDs to node IDs
  const elementIdToNodeId = new Map<string, string>()
  
  // Dependencies between nodes (nodeId -> dependsOn nodeIds)
  const maskDependencies = new Map<string, string[]>()
  
  // Result object
  const result: MaskResolutionResult = {
    processingOrder: [],
    maskSources: new Map<string, string>(),
    circularDependencies: []
  }
  
  // First, build the element ID lookup table
  nodes.forEach((node) => {
    if (node.elementId) {
      elementIdToNodeId.set(node.elementId, node.id)
    }
  })
  
  // Second, identify all mask dependencies
  nodes.forEach((node) => {
    if (node.mask?.source) {
      // Extract element ID from the source reference (remove leading #)
      const sourceElementId = node.mask.source.startsWith('#') 
        ? node.mask.source.substring(1) 
        : node.mask.source
      
      // Look up the node ID for this element ID
      const sourceNodeId = elementIdToNodeId.get(sourceElementId)
      
      if (sourceNodeId) {
        // Store the dependency
        if (!maskDependencies.has(node.id)) {
          maskDependencies.set(node.id, [])
        }
        maskDependencies.get(node.id)?.push(sourceNodeId)
        
        // Also store in the result's maskSources map
        result.maskSources.set(node.id, sourceNodeId)
      } else {
        console.warn(`Mask source "${sourceElementId}" not found for node "${node.id}"`)
      }
    }
  })
  
  // Third, perform topological sort to get processing order
  result.processingOrder = topologicalSort(maskDependencies, result.circularDependencies)
  
  return result
}

/**
 * Performs a topological sort on the dependency graph
 * 
 * @param dependencies - Map of node IDs to their dependencies
 * @param circularDependencies - Output array to store any detected circular dependencies
 * @returns Ordered list of node IDs
 */
function topologicalSort(
  dependencies: Map<string, string[]>,
  circularDependencies: string[][]
): string[] {
  const result: string[] = []
  const visited = new Set<string>()
  const tempVisited = new Set<string>()
  
  // Helper function for depth-first search
  function visit(nodeId: string, path: string[] = []): void {
    // If we've already processed this node, skip it
    if (visited.has(nodeId)) return
    
    // If we encounter a node that's currently being visited, we have a cycle
    if (tempVisited.has(nodeId)) {
      const cycle = [...path.slice(path.indexOf(nodeId)), nodeId]
      circularDependencies.push(cycle)
      return
    }
    
    // Mark node as being visited
    tempVisited.add(nodeId)
    path.push(nodeId)
    
    // Visit all dependencies
    const deps = dependencies.get(nodeId) || []
    for (const depId of deps) {
      visit(depId, [...path])
    }
    
    // Mark as fully visited and add to result
    tempVisited.delete(nodeId)
    visited.add(nodeId)
    result.push(nodeId)
  }
  
  // Visit all nodes
  for (const nodeId of dependencies.keys()) {
    if (!visited.has(nodeId)) {
      visit(nodeId)
    }
  }
  
  // Also include any nodes that aren't in the dependency map
  // but need to be processed (they don't depend on anything)
  const allSourceNodeIds = new Set([...dependencies.values()].flat())
  for (const sourceId of allSourceNodeIds) {
    if (!visited.has(sourceId) && !dependencies.has(sourceId)) {
      result.push(sourceId)
    }
  }
  
  return result.reverse() // Reverse to get correct processing order
}