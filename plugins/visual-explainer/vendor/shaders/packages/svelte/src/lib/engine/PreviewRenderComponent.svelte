<script lang="ts">
interface Props {
  config: any
  componentMap: Record<string, any>
  structureVersion?: number
}

const { config, componentMap, structureVersion = undefined }: Props = $props()

const Component = $derived(componentMap[config.type])
const componentProps = $derived(config.props ? { ...config.props } : {})
</script>

{#if Component}
  <svelte:component
    this={Component}
    id={config.id}
    renderOrder={config.renderOrder}
    {...componentProps}
  >
    {#if config.children}
      {#each config.children as child, index (child.id || `child_${index}_v${structureVersion || 0}`)}
        <svelte:self
          config={{ ...child, renderOrder: child.renderOrder ?? index }}
          {componentMap}
          {structureVersion}
        />
      {/each}
    {/if}
  </svelte:component>
{/if}
