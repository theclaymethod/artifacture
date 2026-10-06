// Public `shaders/config` entry point — the typed helper used by the
// `shaders.config.ts` file that `npx shaders connect` writes into a project.
// Kept dependency-free: it's imported by tooling, never by app code.

export type ShadersFramework = 'react' | 'vue' | 'svelte' | 'solid'

export interface ShadersConfig {
  /** UI framework the installed components target (`shaders/<framework>`). */
  framework: ShadersFramework
  /**
   * ID of the shaders.com project this codebase is connected to. Set by
   * `npx shaders connect`; shaders saved to that project can be installed into
   * this codebase and kept up to date.
   */
  project?: string
  /**
   * Directory (relative to the project root) that `npx shaders install`
   * writes component files into. Chosen per framework by `connect`
   * (e.g. `components/shaders` for Nuxt, `src/lib/components/shaders` for
   * SvelteKit, `src/components/shaders` otherwise).
   */
  outDir?: string
}

export function defineConfig(config: ShadersConfig): ShadersConfig {
  return config
}
