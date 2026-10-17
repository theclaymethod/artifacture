import {defineStd, p} from "@coreroot/std"
import {motionBlur, blurPath} from "@coreroot/std/effects/blurs"
import {transformAngle} from "@coreroot/utilities/transformations"

export interface ComponentProps {
    intensity: number
    angle: Parameters<typeof transformAngle>[0]
}

export const componentDefinition = defineStd<ComponentProps>({
    name: "LinearBlur",
    role: 'filter',
    species: 'gather',
    boundingBoxDeclaration: { aspectRatio: null },
    category: "Blurs",
    description: "Directional motion blur in a specific angle",
    props: {
        intensity: {
            default: 30,
            description: 'Intensity of the linear blur effect',
            ui: { type: ['range', 'map'], min: 0, max: 100, step: 1, label: 'Intensity', group: 'Effect' }
        },
        angle: {
            default: 0,
            transform: transformAngle,
            description: 'Direction of the linear blur (in degrees)',
            ui: { type: ['range', 'map'], min: 0, max: 360, step: 1, label: 'Angle', group: 'Effect' }
        }
    },

    effect: motionBlur({path: blurPath.linear(p('angle')), amount: p('intensity')}),
})

export default componentDefinition
