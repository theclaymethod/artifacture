import { createAxonometricPlan, createAxonometricPlanMotion, createExplodedScene, createExplodedMotion, type AxonometricPlanInput, type ExplodedSceneInput } from '../../visual-explainer-mdx/axonometric-scene';

export const campus: AxonometricPlanInput = {
  id: 'campus', title: 'An illustrative studio campus',
  description: 'A studio, lab and store share a site, with a path between the buildings. The lab is the focus.',
  labelSize: 24, plate: { x: 0, y: 0, width: 230, depth: 180, radius: 8 },
  marks: [{ id: 'path', rect: { x: 4, y: 82, width: 222, depth: 20 } }],
  boxes: [
    { id: 'studio', label: 'Studio', rect: { x: 16, y: 16, width: 80, depth: 48 }, height: 22, phase: 0 },
    { id: 'lab', label: 'Lab', rect: { x: 148, y: 16, width: 64, depth: 48 }, height: 34, active: true, phase: 1 },
    { id: 'store', label: 'Store', rect: { x: 24, y: 118, width: 80, depth: 48 }, height: 18, phase: 2 },
  ],
};
export const office: AxonometricPlanInput = {
  id: 'office', title: 'An illustrative cutaway workspace',
  description: 'Low walls leave the work area visible. Long walls paint behind the desks. The meeting area is the focus.',
  labelSize: 24, plate: { x: 0, y: 0, width: 230, depth: 180 }, thickness: 6,
  marks: [{ id: 'meeting', label: 'Meet', active: true, rect: { x: 116, y: 128, width: 104, depth: 44 } }],
  boxes: [
    { id: 'back-wall', rect: { x: 0, y: 0, width: 230, depth: 6 }, height: 22, phase: 0 },
    { id: 'side-wall', rect: { x: 0, y: 6, width: 6, depth: 174 }, height: 22, phase: 0 },
    { id: 'desk-a', rect: { x: 24, y: 24, width: 72, depth: 32 }, height: 14, phase: 1 },
    { id: 'desk-b', rect: { x: 24, y: 88, width: 72, depth: 32 }, height: 14, phase: 1 },
    { id: 'meeting-table', rect: { x: 140, y: 92, width: 56, depth: 26, radius: 8 }, height: 14, phase: 2 },
  ],
};
export const phone: ExplodedSceneInput = {
  id: 'phone', title: 'The physical layers of an illustrative device',
  description: 'A housing holds a board and battery side by side. They lift together; the display lifts first. These are simplified illustrative parts.',
  labelSize: 24,
  parts: [
    { id: 'housing', label: 'Housing', rect: { x: 0, y: 0, width: 152, depth: 100, radius: 12 }, z: 0, thickness: 24, level: 0, kind: 'tray', wall: 6 },
    { id: 'board', label: 'Board', rect: { x: 8, y: 8, width: 50, depth: 32, radius: 3 }, z: 6, thickness: 6, level: 1, active: true },
    { id: 'battery', label: 'Battery', rect: { x: 70, y: 48, width: 72, depth: 44, radius: 6 }, z: 6, thickness: 12, level: 1 },
    { id: 'display', label: 'Display', rect: { x: 0, y: 0, width: 152, depth: 100, radius: 12 }, z: 24, thickness: 8, level: 2 },
  ],
};
export const unboxing: ExplodedSceneInput = {
  id: 'unboxing', title: 'An illustrative product package',
  description: 'A lid lifts first, then a product and cable together, then the insert. The box stays fixed.',
  labelSize: 24,
  parts: [
    { id: 'box', label: 'Box', rect: { x: 0, y: 0, width: 152, depth: 100, radius: 12 }, z: 0, thickness: 48, level: 0, kind: 'tray', wall: 6 },
    { id: 'insert', label: 'Insert', rect: { x: 8, y: 8, width: 136, depth: 84, radius: 6 }, z: 6, thickness: 12, level: 1 },
    { id: 'product', label: 'Product', rect: { x: 28, y: 14, width: 72, depth: 60, radius: 12 }, z: 18, thickness: 28, level: 2, active: true },
    { id: 'cable', label: 'Cable', rect: { x: 112, y: 52, width: 24, depth: 32, radius: 10 }, z: 18, thickness: 8, level: 2 },
    { id: 'lid', label: 'Lid', rect: { x: 0, y: 0, width: 152, depth: 100, radius: 12 }, z: 48, thickness: 12, level: 3 },
  ],
};
export const planScenes = [campus, office].map(input => ({ input, scene: createAxonometricPlan(input), motion: createAxonometricPlanMotion(input) }));
export const explodedScenes = [phone, unboxing].map(input => ({ input, scene: createExplodedScene(input), motion: createExplodedMotion(input) }));
