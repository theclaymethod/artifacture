import { createGraphicScene, type GraphicBounds, type GraphicScene } from './graphics-types';

export type HairlineSolid = Readonly<{
  id: string;
  meaning?: string;
  paths: Readonly<{ sil: string; crease: string }>;
  active?: boolean;
}>;

/** Accept unchanged HL.prism geometry in its authored back-to-front order. */
export function createHairlineScene({ id, title, description, solids, bounds = { x: 0, y: 0, width: 400, height: 320 } }: {
  id: string;
  title: string;
  description: string;
  solids: readonly HairlineSolid[];
  bounds?: GraphicBounds;
}): GraphicScene {
  if (!solids.length) throw new Error('A Hairline scene needs a composed solid.');
  if (solids.filter(solid => solid.active).length > 1) throw new Error('A Hairline scene has one active solid.');
  return createGraphicScene({
    id, title, description, bounds,
    objects: solids.map(solid => ({
      id: solid.id, kind: 'illustration', meaning: solid.meaning,
      state: { opacity: 1, reveal: 1, highlight: solid.active ?? false, x: 0, y: 0 },
      primitives: [
        { kind: 'path', d: solid.paths.sil, fill: 'background', stroke: 'illustration-ink', strokeRole: solid.active ? 'active' : 'structure' },
        ...(solid.paths.crease ? [{ kind: 'path' as const, d: solid.paths.crease, fill: 'none' as const, stroke: 'illustration-muted' as const, strokeRole: 'detail' as const }] : []),
      ],
    })),
  });
}
