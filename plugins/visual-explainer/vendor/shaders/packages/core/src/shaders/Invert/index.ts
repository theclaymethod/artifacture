import type {GpuShaderDefinition} from "@coreroot/gpu/porters"
import {defineStd} from "@coreroot/std"
import {invert} from "@coreroot/std/effects/color"

export interface ComponentProps {}

export const componentDefinition: GpuShaderDefinition<ComponentProps> = defineStd<ComponentProps>({
    name: "Invert",
    role: 'filter',
    species: 'pointwise',
    boundingBoxDeclaration: { aspectRatio: null },
    category: "Adjustments",
    description: "Invert RGB colors while preserving alpha",
    props: {},
    effect: invert(),
    missingChildMessage: 'You must pass a child component into the Invert shader.',
})

export default componentDefinition
