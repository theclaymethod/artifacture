// Curated presets in the CLI: `npx shaders install offsets-1` (or a preset
// UUID). Signed-in Pro users get the preset cloned into their project and
// installed from the clone, so the file tracks something they can edit in the
// design editor. Everyone else gets the offer screen: get Pro, sign in, or
// install the watermarked <Preview> placeholder that `update` upgrades later.
import { consola } from 'consola'
import { api, ApiError, getApiUrl, GoneError, projectGone } from './api'
import { login, openBrowser, type Credentials, type Me } from './auth'
import { setConfigField } from './configFile'
import { cancelled, chooseProject, isInteractive, type InitFlags } from './init'
import type { LockSource } from './lockFile'
import type { ProjectContext } from './project'
import type { ShadersFramework } from '../config'

export interface PresetSummary {
  id: string
  slug: string
  title: string
  variant: number
  collection: { slug: string, name: string }
  thumbnail: string | null
  description: string | null
}

type PresetLookup =
  | { kind: 'preset', preset: PresetSummary }
  | { kind: 'collection', collection: { slug: string, name: string }, variants: PresetSummary[] }

const CANCEL = Symbol.for('cancel')

/** Saved shaders are numeric ids; anything else is a preset reference. */
export function isPresetRef(ref: string): boolean {
  return !/^\d+$/.test(ref)
}

export function pricingUrl(slug: string | null): string {
  const url = new URL('/pricing', getApiUrl() + '/')
  url.searchParams.set('utm_source', 'cli')
  url.searchParams.set('utm_medium', 'terminal')
  if (slug) url.searchParams.set('utm_campaign', slug)
  return url.toString()
}

/** Public metadata; resolves slugs, UUIDs and bare collection slugs (→ variant choice). */
export async function resolvePreset(ref: string, flags: { yes: boolean }): Promise<PresetSummary> {
  let lookup: PresetLookup
  try {
    lookup = await api<PresetLookup>(`/api/plugin/presets/${encodeURIComponent(ref.toLowerCase())}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new GoneError(`No preset called "${ref}" is available in Shaders — it may have been retired. Preset names look like offsets-1.`, 'preset')
    }
    throw error
  }
  if (lookup.kind === 'preset') return lookup.preset

  if (lookup.variants.length === 1 || !isInteractive(flags)) return lookup.variants[0]
  const choice = await consola.prompt(`"${lookup.collection.name}" has ${lookup.variants.length} variants — which one?`, {
    type: 'select',
    options: lookup.variants.map(v => ({ value: v.id, label: v.title, hint: v.slug })),
    cancel: 'symbol'
  })
  if ((choice as unknown) === CANCEL) cancelled()
  return lookup.variants.find(v => v.id === choice) ?? lookup.variants[0]
}

export function presetSource(preset: PresetSummary, kind: LockSource['kind']): LockSource {
  return { kind, presetId: preset.id, slug: preset.slug }
}

// ---------------------------------------------------------------------------
// Clone into the user's project
// ---------------------------------------------------------------------------

export interface ClonedShader {
  id: string
  title: string
  project_id: string
  updated_at: string | null
}

/** Make sure the config points at a project, choosing/creating one if needed. */
export async function ensureProject(ctx: ProjectContext, credentials: Credentials, flags: InitFlags): Promise<string> {
  if (ctx.project) return ctx.project
  const project = await chooseProject(credentials, ctx.detected, flags)
  if (!project) throw new Error('A Shaders project is needed to hold the preset. Pass --project <id> or run npx shaders connect')
  if (await setConfigField(ctx.configFile, 'project', project.id)) {
    consola.success(`Connected project "${project.title}"`)
  } else {
    consola.warn(`Couldn't update your shaders config automatically — add project: '${project.id}' to it`)
  }
  ctx.project = project.id
  return project.id
}

export async function clonePreset(credentials: Credentials, preset: PresetSummary, projectId: string): Promise<ClonedShader> {
  try {
    return await api<ClonedShader>(`/api/plugin/presets/${encodeURIComponent(preset.id)}/clone`, {
      method: 'POST',
      token: credentials.accessToken,
      body: { project_id: projectId }
    })
  } catch (error) {
    if (error instanceof ApiError && error.isProjectNotFound) throw projectGone(projectId)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Offer screen (signed out / not Pro)
// ---------------------------------------------------------------------------

export type OfferOutcome =
  | { kind: 'pro', credentials: Credentials, me: Me }
  | { kind: 'preview' }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * "<Preset> requires a Shaders Pro subscription" + the three choices. Loops
 * until the user ends up on Pro, picks the preview, or cancels. `signedIn`
 * hides the sign-in option (they already are) and is refreshed after each
 * sign-in so the loop never offers a dead choice.
 */
export async function offerPro(preset: PresetSummary, signedIn: { credentials: Credentials, me: Me } | null, flags: { yes: boolean }): Promise<OfferOutcome> {
  const heading = `${preset.title} requires a Shaders Pro subscription`
  const pricing = pricingUrl(preset.slug)

  if (!isInteractive(flags)) {
    throw new Error(`${heading}.\n  Get Pro: ${pricing}\n  Then run: npx shaders login && npx shaders install ${preset.slug}`)
  }

  let state = signedIn
  for (;;) {
    consola.log('')
    const options = [
      { value: 'pro', label: 'Get Shaders Pro', hint: 'opens the pricing page in your browser' },
      ...(state ? [] : [{ value: 'login', label: 'Sign in to an existing account' }]),
      { value: 'preview', label: 'Install a free watermarked preview instead', hint: '`npx shaders update` swaps in the real thing once you have Pro' }
    ]
    const choice = await consola.prompt(heading, { type: 'select', options, cancel: 'symbol' })
    if ((choice as unknown) === CANCEL) cancelled()

    if (choice === 'preview') return { kind: 'preview' }

    if (choice === 'pro') {
      consola.info(`Opening ${pricing}`)
      openBrowser(pricing)
      const done = await consola.prompt('Press enter here once you\'ve finished in your browser', { type: 'text', placeholder: '', default: '', cancel: 'symbol' })
      if ((done as unknown) === CANCEL) cancelled()
      // Brief pause so a just-completed checkout has propagated before we probe
      await sleep(500)
    }

    // Both remaining paths end in a sign-in (fresh, or re-verifying the current one)
    const credentials = state && choice === 'pro' ? state.credentials : await login()
    let me: Me
    try {
      me = await api<Me>('/api/plugin/me', { token: credentials.accessToken })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && state) {
        // Stored token died mid-flow → sign in properly next round
        state = null
        continue
      }
      throw error
    }
    state = { credentials, me }
    if (me.isPro) return { kind: 'pro', credentials, me }
    consola.warn(`Signed in${me.email ? ` as ${me.email}` : ''}, but this account doesn't have Shaders Pro yet`)
  }
}

// ---------------------------------------------------------------------------
// Watermarked preview placeholder
// ---------------------------------------------------------------------------

/**
 * A few lines rendering `<Preview presetId>` from the user's framework
 * package — the same snippets the Pro upgrade dialog hands out. Works signed
 * out (the watermark is injected server-side), and `update` replaces it with
 * real source once the account has Pro.
 */
export function renderPreviewFile(framework: ShadersFramework, component: string, preset: PresetSummary): string {
  const note = [
    `Watermarked preview of "${preset.title}" from Shaders (${preset.slug}).`,
    `Fetches the preset at runtime. Once your account has Shaders Pro, run`,
    `\`npx shaders update\` to replace this file with the full component source.`
  ]
  switch (framework) {
    case 'react':
    case 'solid':
      return [
        `import { Preview } from 'shaders/${framework}'`,
        ``,
        ...note.map(l => `// ${l}`),
        `export default function ${component}() {`,
        `  return <Preview presetId="${preset.id}" />`,
        `}`,
        ``
      ].join('\n')
    case 'vue':
      return [
        `<script setup lang="ts">`,
        ...note.map(l => `// ${l}`),
        `import { Preview } from 'shaders/vue'`,
        `</script>`,
        ``,
        `<template>`,
        `  <Preview preset-id="${preset.id}" />`,
        `</template>`,
        ``
      ].join('\n')
    case 'svelte':
      return [
        `<script lang="ts">`,
        ...note.map(l => `  // ${l}`),
        `  import { Preview } from 'shaders/svelte'`,
        `</script>`,
        ``,
        `<Preview presetId="${preset.id}" />`,
        ``
      ].join('\n')
  }
}
