import { resolve, dirname } from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Human-readable descriptions for each PropUIType
 * These describe what kinds of values the prop accepts
 */
const UI_TYPE_DESCRIPTIONS: Record<string, string> = {
  color: 'Accepts hex strings (`#ff0000`), RGB objects (`{ r, g, b }`), or CSS color names (`limegreen`).',
  position: 'Accepts `{ x, y }` objects with values from 0 to 1, or CSS positions like `top center`.',
  range: 'Accepts a number within the specified range.',
  number: 'Accepts a numeric value.',
  checkbox: 'Accepts a boolean value (`true` or `false`).',
  text: 'Accepts a string value.',
  select: 'Accepts one of the predefined option values.',
  'image-upload': 'Accepts an image URL as a string.'
}

/**
 * Extract balanced braces content starting from a position
 */
function extractBalancedBraces(content: string, startPos: number): string {
  let depth = 0
  let start = -1

  for (let i = startPos; i < content.length; i++) {
    if (content[i] === '{') {
      if (start === -1) start = i
      depth++
    } else if (content[i] === '}') {
      depth--
      if (depth === 0) {
        return content.slice(start + 1, i)
      }
    }
  }

  return ''
}

/**
 * Extract prop metadata from a shader source file
 */
function extractPropMetadata(sourceContent: string): Record<string, {
  description?: string
  default?: any
  uiType?: string
  options?: Array<{ label: string; value: any }>
  min?: number
  max?: number
}> {
  const props: Record<string, any> = {}

  // Find the props object in componentDefinition
  const propsStartMatch = sourceContent.match(/props:\s*\{/)
  if (!propsStartMatch || propsStartMatch.index === undefined) return props

  const propsContent = extractBalancedBraces(sourceContent, propsStartMatch.index)
  if (!propsContent) return props

  // Known PropConfig keys that are NOT actual props
  const propConfigKeys = new Set(['default', 'transform', 'description', 'ui', 'type', 'min', 'max', 'step', 'options', 'label'])

  // Find each prop by looking for pattern: propName: {
  const propStartRegex = /(\w+):\s*\{/g
  let propMatch

  while ((propMatch = propStartRegex.exec(propsContent)) !== null) {
    const propName = propMatch[1]

    // Skip known PropConfig keys (these are nested properties, not actual props)
    if (propConfigKeys.has(propName)) continue

    const propContent = extractBalancedBraces(propsContent, propMatch.index + propMatch[0].length - 1)

    if (!propContent) continue

    // Extract description
    const descMatch = propContent.match(/description:\s*["'`]([^"'`]+)["'`]/)
    const description = descMatch ? descMatch[1] : undefined

    // Extract default value
    let defaultValue: any = undefined
    const defaultStartMatch = propContent.match(/default:\s*/)
    if (defaultStartMatch && defaultStartMatch.index !== undefined) {
      const afterDefault = propContent.slice(defaultStartMatch.index + defaultStartMatch[0].length)

      if (afterDefault.trimStart().startsWith('{')) {
        // Object default - extract using balanced braces
        const objContent = extractBalancedBraces(afterDefault.trimStart(), 0)
        if (objContent) {
          // Parse the object to extract values
          const xMatch = objContent.match(/x:\s*([0-9.]+)/)
          const yMatch = objContent.match(/y:\s*([0-9.]+)/)
          if (xMatch && yMatch) {
            defaultValue = { x: Number(xMatch[1]), y: Number(yMatch[1]) }
          } else {
            defaultValue = '{...}'
          }
        }
      } else {
        // Simple value
        const simpleMatch = afterDefault.match(/^([^,\n]+)/)
        if (simpleMatch) {
          const rawDefault = simpleMatch[1].trim()
          if (rawDefault.startsWith('"') || rawDefault.startsWith("'")) {
            defaultValue = rawDefault.replace(/["']/g, '')
          } else if (rawDefault === 'true' || rawDefault === 'false') {
            defaultValue = rawDefault === 'true'
          } else if (!isNaN(Number(rawDefault))) {
            defaultValue = Number(rawDefault)
          } else {
            defaultValue = rawDefault
          }
        }
      }
    }

    // Extract UI type
    const uiMatch = propContent.match(/type:\s*["'](\w+(?:-\w+)?)["']/)
    const uiType = uiMatch ? uiMatch[1] : undefined

    // Extract options for select type
    let options: Array<{ label: string; value: any }> | undefined
    if (uiType === 'select') {
      const optionsMatch = propContent.match(/options:\s*\[([\s\S]*?)\]/)
      if (optionsMatch) {
        const optionsContent = optionsMatch[1]
        const optionMatches = optionsContent.matchAll(/\{[^}]*label:\s*["']([^"']+)["'][^}]*value:\s*["']?([^"'\s,}]+)["']?[^}]*\}/g)
        options = []
        for (const opt of optionMatches) {
          options.push({ label: opt[1], value: opt[2] })
        }
      }
    }

    // Extract min/max for range type
    let min: number | undefined
    let max: number | undefined
    if (uiType === 'range' || uiType === 'number') {
      const minMatch = propContent.match(/min:\s*(-?[\d.]+)/)
      const maxMatch = propContent.match(/max:\s*(-?[\d.]+)/)
      if (minMatch) min = Number(minMatch[1])
      if (maxMatch) max = Number(maxMatch[1])
    }

    props[propName] = {
      description,
      default: defaultValue,
      uiType,
      options,
      min,
      max
    }
  }

  return props
}

/**
 * Generate JSDoc comment for a prop
 */
function generateJSDoc(propMeta: {
  description?: string
  default?: any
  uiType?: string
  options?: Array<{ label: string; value: any }>
  min?: number
  max?: number
}, indent: string = '    '): string {
  const lines: string[] = [`${indent}/**`]

  // Add description
  if (propMeta.description) {
    lines.push(`${indent} * ${propMeta.description}`)
    lines.push(`${indent} *`)
  }

  // Add UI type description
  if (propMeta.uiType && UI_TYPE_DESCRIPTIONS[propMeta.uiType]) {
    let typeDesc = UI_TYPE_DESCRIPTIONS[propMeta.uiType]

    // Enhance range description with min/max if available
    if (propMeta.uiType === 'range' && propMeta.min !== undefined && propMeta.max !== undefined) {
      typeDesc = `Accepts a number between ${propMeta.min} and ${propMeta.max}.`
    }

    // Enhance select description with options if available
    if (propMeta.uiType === 'select' && propMeta.options && propMeta.options.length > 0) {
      const optionValues = propMeta.options.map(o => `\`"${o.value}"\``).join(', ')
      typeDesc = `Accepts one of: ${optionValues}.`
    }

    lines.push(`${indent} * ${typeDesc}`)
  }

  // Add default value
  if (propMeta.default !== undefined) {
    const defaultStr = typeof propMeta.default === 'string'
      ? `"${propMeta.default}"`
      : JSON.stringify(propMeta.default)
    lines.push(`${indent} * @default ${defaultStr}`)
  }

  lines.push(`${indent} */`)
  return lines.join('\n')
}

/**
 * Inject JSDoc comments into a .d.ts file
 */
function injectJSDocIntoDts(dtsPath: string, propsMetadata: Record<string, any>): boolean {
  if (!fs.existsSync(dtsPath)) {
    return false
  }

  let content = fs.readFileSync(dtsPath, 'utf-8')
  let modified = false

  // Find the ComponentProps interface
  const interfaceMatch = content.match(/export interface ComponentProps \{([\s\S]*?)\n\}/)
  if (!interfaceMatch) {
    return false
  }

  const interfaceContent = interfaceMatch[1]

  // Split by lines and process each prop
  const lines = interfaceContent.split('\n')
  const newLines: string[] = []

  for (const line of lines) {
    // Check if this line is a prop declaration
    const propMatch = line.match(/^(\s*)(\w+)(\??:\s*.*)$/)

    if (propMatch) {
      const [, indent, propName, rest] = propMatch
      const propMeta = propsMetadata[propName]

      if (propMeta && (propMeta.description || propMeta.uiType)) {
        const jsDoc = generateJSDoc(propMeta, indent)
        newLines.push(jsDoc)
        modified = true
      }
    }

    newLines.push(line)
  }

  if (modified) {
    const newInterfaceContent = newLines.join('\n')
    content = content.replace(interfaceMatch[1], newInterfaceContent)
    fs.writeFileSync(dtsPath, content)
  }

  return modified
}

/**
 * Main function to inject JSDoc into all shader .d.ts files
 */
function main() {
  const rootDir = resolve(__dirname, '..')
  const shaderDir = resolve(rootDir, 'src/shaders')
  const distShaderDir = resolve(rootDir, 'dist/shaders')

  if (!fs.existsSync(distShaderDir)) {
    console.error('❌ dist/shaders directory not found. Run build first.')
    process.exit(1)
  }

  const shaderDirs = fs.readdirSync(shaderDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dirent => fs.existsSync(resolve(shaderDir, dirent.name, 'index.ts')))

  let modifiedCount = 0

  for (const dir of shaderDirs) {
    const sourcePath = resolve(shaderDir, dir.name, 'index.ts')
    const dtsPath = resolve(distShaderDir, dir.name, 'index.d.ts')

    // Read source and extract metadata
    const sourceContent = fs.readFileSync(sourcePath, 'utf-8')
    const propsMetadata = extractPropMetadata(sourceContent)

    // Inject JSDoc into .d.ts
    if (injectJSDocIntoDts(dtsPath, propsMetadata)) {
      modifiedCount++
    }
  }

  console.log(`✅ Injected JSDoc comments into ${modifiedCount} shader type definitions`)
}

main()
