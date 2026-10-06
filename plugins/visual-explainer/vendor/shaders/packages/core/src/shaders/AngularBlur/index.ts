import {defineStd, p} from "@coreroot/std"
import {motionBlur, blurPath} from "@coreroot/std/effects/blurs"
import {transformPosition} from "@coreroot/utilities/transformations"

export interface ComponentProps {
    intensity: number
    center: Parameters<typeof transformPosition>[0]
}

export const componentDefinition = defineStd<ComponentProps>({
    name: "AngularBlur",
    role: 'filter',
    species: 'gather',
    boundingBoxDeclaration: { aspectRatio: null },
    category: "Blurs",
    description: "Radial motion blur rotating around a center point",
    props: {
        intensity: {
            default: 20,
            description: 'Intensity of the angular blur effect',
            ui: { type: ['range', 'map'], min: 0, max: 100, step: 1, label: 'Blur Intensity', group: 'Effect' }
        },
        center: {
            default: {
                x: 0.5,
                y: 0.5
            },
            transform: transformPosition,
            description: 'The center point of the rotation',
            ui: {
                type: 'position',
                label: 'Center Position',
                group: 'Position'
            }
        }
    },

    effect: motionBlur({path: blurPath.orbit(p('center')), amount: p('intensity')}),
})

export default componentDefinition
