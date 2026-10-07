import {defineStd, p} from "@coreroot/std"
import {motionBlur, blurPath} from "@coreroot/std/effects/blurs"
import {transformPosition} from "@coreroot/utilities/transformations"

export interface ComponentProps {
    intensity: number
    center: Parameters<typeof transformPosition>[0]
}

export const componentDefinition = defineStd<ComponentProps>({
    name: "ZoomBlur",
    role: 'filter',
    species: 'gather',
    boundingBoxDeclaration: { aspectRatio: null },
    category: "Blurs",
    description: "Radial zoom blur expanding from a center point",
    props: {
        intensity: {
            default: 30,
            description: 'Intensity of the zoom blur effect',
            ui: { type: ['range', 'map'], min: 0, max: 100, step: 1, label: 'Intensity', group: 'Effect' }
        },
        center: {
            default: {
                x: 0.5,
                y: 0.5
            },
            transform: transformPosition,
            description: 'Center point of the zoom blur',
            ui: {
                type: 'position',
                label: 'Center',
                group: 'Position'
            }
        }
    },

    effect: motionBlur({path: blurPath.zoom(p('center')), amount: p('intensity')}),
})

export default componentDefinition
