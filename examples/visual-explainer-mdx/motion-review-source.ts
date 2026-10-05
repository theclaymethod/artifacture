import { createGraphicScene, type GraphicObject, type GraphicPrimitive } from '../../visual-explainer-mdx/graphics-types';
import { createHairlineScene } from '../../visual-explainer-mdx/hairline-scene';
import { agentSolids } from './showcase-hairline';

const ownerId = (id: string) => id === 'agent' ? 'handler' : id === 'memory' ? 'cache' : id === 'tool' ? 'storage' : undefined;
const figureSolids = agentSolids.filter(solid => solid.id !== 'review').map(solid => {
  const owner = ownerId(solid.id);
  return { ...solid, id: owner ?? solid.id, meaning: owner ?? solid.meaning };
});

export const quantityFigureBounds = { x: 45, y: 40, width: 320, height: 218 } as const;
export const quantityFigureAnchors = {
  request: { x: 202, y: 82 },
  handler: { x: 214, y: 112 },
  cache: { x: 146, y: 107 },
  storage: { x: 281, y: 132 },
  result: { x: 204, y: 181 },
} as const;

const label = (x: number, y: number, value: string, size = 12): Extract<GraphicPrimitive, { kind: 'text' }> => ({
  kind: 'text', x, y, lines: [value], size, leading: size * 1.3,
  anchor: 'middle', fill: 'ink', font: 'body',
});
const value = (id: string, x: number, y: number, n: number): GraphicObject => ({
  id, kind: 'illustration', meaning: `Quantity ${n}`,
  primitives: [{ ...label(x, y, String(n), 16), font: 'mono' }],
});

/** The same prepared Hairline solids and anchors register both comparison sides. */
export function createQuantityFigure(written: 0 | 1) {
  const base = createHairlineScene({
    id: 'quantity-workspace', title: 'Follow an explicit zero',
    description: 'A request reaches a handler, retrieves a cached zero, and writes a quantity to storage.',
    bounds: quantityFigureBounds, solids: figureSolids,
  });
  return createGraphicScene({ ...base, objects: [
    ...base.objects,
    { id: 'owner-labels', kind: 'illustration', primitives: [
      label(202, 56, 'Read cart'), label(93, 100, 'Cache'),
      label(213, 153, 'Handler'), label(309, 184, 'Saved'),
      label(204, 227, 'Returned'),
    ] },
    value('value:cache', 146, 115, 0),
    value('value:written', 281, 154, written),
    value('value:returned', 204, 194, written),
  ] });
}

// Stable parts are reused literally. Only the operator receives a new identity.
export const quantitySourceVersions = [
  { id: 'before', lines: [
    [{ id: 'cache-read', text: 'const cached = cache.get(key);' }],
    [{ id: 'declaration', text: 'const quantity = cached ' }, { id: 'falsy', text: '||' }, { id: 'default', text: ' 1;' }],
    [],
    [{ id: 'write-start', text: 'await storage.write({' }],
    [{ id: 'write-quantity', text: '  quantity,' }],
    [{ id: 'write-end', text: '});' }],
    [{ id: 'return', text: 'return quantity;' }],
  ] },
  { id: 'after', lines: [
    [{ id: 'cache-read', text: 'const cached = cache.get(key);' }],
    [{ id: 'declaration', text: 'const quantity = cached ' }, { id: 'nullish', text: '??' }, { id: 'default', text: ' 1;' }],
    [],
    [{ id: 'write-start', text: 'await storage.write({' }],
    [{ id: 'write-quantity', text: '  quantity,' }],
    [{ id: 'write-end', text: '});' }],
    [{ id: 'return', text: 'return quantity;' }],
  ] },
] as const;

export const motionReviewTiming = {
  "duration": 73.52,
  "audioStart": 0.6,
  "audioDuration": 71.92,
  "cues": [
    {
      "id": "hook",
      "text": "An empty cart has zero items. This handler saves one. Where did the extra item come from?",
      "start": 0.6,
      "end": 9.24,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 0.0,
        "end": 8.64
      }
    },
    {
      "id": "trace",
      "text": "The cache returns zero. We want a default when no quantity is saved. This line says: cached, or one.",
      "start": 9.24,
      "end": 20.28,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 8.64,
        "end": 19.68
      }
    },
    {
      "id": "broken",
      "text": "Zero or one returns one. Or tests truthiness. Zero is falsy, so the fallback wins. That is the quantity we save.",
      "start": 20.28,
      "end": 32.2,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 19.68,
        "end": 31.6
      }
    },
    {
      "id": "contrast",
      "text": "But zero is a value. It means an empty cart. Null or undefined means we don't have a quantity.",
      "start": 32.2,
      "end": 40.36,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 31.6,
        "end": 39.76
      }
    },
    {
      "id": "fix",
      "text": "Use nullish coalescing instead. Now the default applies only to null or undefined. Zero survives.",
      "start": 40.36,
      "end": 51.24,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 39.76,
        "end": 50.64
      }
    },
    {
      "id": "replay",
      "text": "Run the same request again. Zero leaves the cache, crosses the handler, and stays zero in storage. A missing quantity still defaults to one.",
      "start": 51.24,
      "end": 64.6,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 50.64,
        "end": 64.0
      }
    },
    {
      "id": "close",
      "text": "We kept the default. We changed its question: is this value missing, or is it zero?",
      "start": 64.6,
      "end": 72.36,
      "alignment": "measured",
      "source": "Pinned Parakeet unprompted recognition",
      "sourceInterval": {
        "start": 64.0,
        "end": 71.76
      }
    }
  ],
  "wordCues": [
    {
      "text": "An",
      "start": 0.6,
      "end": 0.84
    },
    {
      "text": "empty",
      "start": 0.84,
      "end": 1.4
    },
    {
      "text": "cart",
      "start": 1.4,
      "end": 1.96
    },
    {
      "text": "has",
      "start": 1.96,
      "end": 2.28
    },
    {
      "text": "zero",
      "start": 2.28,
      "end": 2.92
    },
    {
      "text": "items.",
      "start": 2.92,
      "end": 4.04
    },
    {
      "text": "This",
      "start": 4.04,
      "end": 4.36
    },
    {
      "text": "handler",
      "start": 4.36,
      "end": 4.92
    },
    {
      "text": "saves",
      "start": 5.16,
      "end": 5.8
    },
    {
      "text": "one.",
      "start": 5.8,
      "end": 6.76
    },
    {
      "text": "Where",
      "start": 6.76,
      "end": 7.16
    },
    {
      "text": "did",
      "start": 7.16,
      "end": 7.4
    },
    {
      "text": "the",
      "start": 7.4,
      "end": 7.56
    },
    {
      "text": "extra",
      "start": 7.56,
      "end": 7.88
    },
    {
      "text": "item",
      "start": 7.88,
      "end": 8.44
    },
    {
      "text": "come",
      "start": 8.44,
      "end": 8.76
    },
    {
      "text": "from?",
      "start": 8.76,
      "end": 9.24
    },
    {
      "text": "The",
      "start": 9.24,
      "end": 9.56
    },
    {
      "text": "cache",
      "start": 9.56,
      "end": 10.04
    },
    {
      "text": "returns",
      "start": 10.04,
      "end": 10.84
    },
    {
      "text": "zero.",
      "start": 10.84,
      "end": 12.28
    },
    {
      "text": "We",
      "start": 12.28,
      "end": 12.6
    },
    {
      "text": "want",
      "start": 12.6,
      "end": 12.84
    },
    {
      "text": "a",
      "start": 12.84,
      "end": 13.08
    },
    {
      "text": "default",
      "start": 13.08,
      "end": 13.72
    },
    {
      "text": "when",
      "start": 13.72,
      "end": 14.04
    },
    {
      "text": "no",
      "start": 14.04,
      "end": 14.2
    },
    {
      "text": "quantity",
      "start": 14.2,
      "end": 14.68
    },
    {
      "text": "is",
      "start": 14.68,
      "end": 15.0
    },
    {
      "text": "saved.",
      "start": 15.0,
      "end": 16.36
    },
    {
      "text": "This",
      "start": 16.36,
      "end": 16.68
    },
    {
      "text": "line",
      "start": 16.68,
      "end": 17.08
    },
    {
      "text": "says",
      "start": 17.08,
      "end": 17.56
    },
    {
      "text": "cached",
      "start": 17.56,
      "end": 18.44
    },
    {
      "text": "or",
      "start": 18.76,
      "end": 19.08
    },
    {
      "text": "one.",
      "start": 19.08,
      "end": 20.28
    },
    {
      "text": "Zero",
      "start": 20.28,
      "end": 20.84
    },
    {
      "text": "or",
      "start": 20.84,
      "end": 21.16
    },
    {
      "text": "one",
      "start": 21.16,
      "end": 21.24
    },
    {
      "text": "returns",
      "start": 21.48,
      "end": 22.28
    },
    {
      "text": "one.",
      "start": 22.28,
      "end": 23.4
    },
    {
      "text": "Or",
      "start": 23.4,
      "end": 23.72
    },
    {
      "text": "tests",
      "start": 23.72,
      "end": 24.28
    },
    {
      "text": "truthiness.",
      "start": 24.28,
      "end": 25.8
    },
    {
      "text": "Zero",
      "start": 25.8,
      "end": 26.36
    },
    {
      "text": "is",
      "start": 26.36,
      "end": 26.68
    },
    {
      "text": "falsey,",
      "start": 26.68,
      "end": 27.48
    },
    {
      "text": "so",
      "start": 27.48,
      "end": 27.64
    },
    {
      "text": "the",
      "start": 27.64,
      "end": 27.8
    },
    {
      "text": "fallback",
      "start": 27.8,
      "end": 28.6
    },
    {
      "text": "wins.",
      "start": 28.6,
      "end": 29.8
    },
    {
      "text": "That",
      "start": 29.8,
      "end": 30.12
    },
    {
      "text": "is",
      "start": 30.12,
      "end": 30.28
    },
    {
      "text": "the",
      "start": 30.28,
      "end": 30.44
    },
    {
      "text": "quantity",
      "start": 30.44,
      "end": 31.08
    },
    {
      "text": "we",
      "start": 31.08,
      "end": 31.4
    },
    {
      "text": "save.",
      "start": 31.4,
      "end": 32.2
    },
    {
      "text": "But",
      "start": 32.2,
      "end": 32.52
    },
    {
      "text": "zero",
      "start": 32.52,
      "end": 33.0
    },
    {
      "text": "is",
      "start": 33.0,
      "end": 33.16
    },
    {
      "text": "a",
      "start": 33.16,
      "end": 33.4
    },
    {
      "text": "value.",
      "start": 33.4,
      "end": 34.2
    },
    {
      "text": "It",
      "start": 34.2,
      "end": 34.36
    },
    {
      "text": "means",
      "start": 34.36,
      "end": 34.76
    },
    {
      "text": "an",
      "start": 34.76,
      "end": 34.92
    },
    {
      "text": "empty",
      "start": 34.92,
      "end": 35.48
    },
    {
      "text": "cart.",
      "start": 35.48,
      "end": 36.36
    },
    {
      "text": "Null",
      "start": 36.68,
      "end": 37.16
    },
    {
      "text": "or",
      "start": 37.32,
      "end": 37.56
    },
    {
      "text": "undefined",
      "start": 37.56,
      "end": 38.36
    },
    {
      "text": "means",
      "start": 38.36,
      "end": 38.76
    },
    {
      "text": "we",
      "start": 38.76,
      "end": 38.92
    },
    {
      "text": "don't",
      "start": 38.92,
      "end": 39.16
    },
    {
      "text": "have",
      "start": 39.16,
      "end": 39.32
    },
    {
      "text": "a",
      "start": 39.32,
      "end": 39.48
    },
    {
      "text": "quantity.",
      "start": 39.48,
      "end": 40.36
    },
    {
      "text": "Use",
      "start": 40.36,
      "end": 40.76
    },
    {
      "text": "nullish",
      "start": 40.76,
      "end": 41.4
    },
    {
      "text": "coalescing",
      "start": 41.4,
      "end": 42.36
    },
    {
      "text": "instead.",
      "start": 42.36,
      "end": 43.88
    },
    {
      "text": "Now",
      "start": 43.88,
      "end": 44.28
    },
    {
      "text": "the",
      "start": 44.28,
      "end": 44.52
    },
    {
      "text": "default",
      "start": 44.52,
      "end": 45.16
    },
    {
      "text": "applies",
      "start": 45.16,
      "end": 45.72
    },
    {
      "text": "only",
      "start": 45.72,
      "end": 45.88
    },
    {
      "text": "to",
      "start": 45.88,
      "end": 46.12
    },
    {
      "text": "null",
      "start": 46.12,
      "end": 46.6
    },
    {
      "text": "or",
      "start": 46.6,
      "end": 46.84
    },
    {
      "text": "undefined.",
      "start": 46.84,
      "end": 48.36
    },
    {
      "text": "Zero",
      "start": 48.36,
      "end": 49.0
    },
    {
      "text": "survives.",
      "start": 49.16,
      "end": 51.24
    },
    {
      "text": "Run",
      "start": 51.24,
      "end": 51.64
    },
    {
      "text": "the",
      "start": 51.64,
      "end": 51.88
    },
    {
      "text": "same",
      "start": 51.88,
      "end": 52.2
    },
    {
      "text": "request",
      "start": 52.2,
      "end": 52.76
    },
    {
      "text": "again.",
      "start": 52.76,
      "end": 53.72
    },
    {
      "text": "Zero",
      "start": 53.72,
      "end": 54.28
    },
    {
      "text": "leaves",
      "start": 54.28,
      "end": 54.76
    },
    {
      "text": "the",
      "start": 54.76,
      "end": 55.0
    },
    {
      "text": "cache,",
      "start": 55.0,
      "end": 55.72
    },
    {
      "text": "crosses",
      "start": 55.72,
      "end": 56.28
    },
    {
      "text": "the",
      "start": 56.28,
      "end": 56.52
    },
    {
      "text": "handler,",
      "start": 56.52,
      "end": 57.24
    },
    {
      "text": "and",
      "start": 57.24,
      "end": 57.48
    },
    {
      "text": "stays",
      "start": 57.48,
      "end": 57.96
    },
    {
      "text": "zero",
      "start": 57.96,
      "end": 58.36
    },
    {
      "text": "in",
      "start": 58.36,
      "end": 58.68
    },
    {
      "text": "storage.",
      "start": 58.68,
      "end": 59.8
    },
    {
      "text": "A",
      "start": 59.8,
      "end": 60.12
    },
    {
      "text": "missing",
      "start": 60.12,
      "end": 60.52
    },
    {
      "text": "quantity",
      "start": 60.52,
      "end": 61.0
    },
    {
      "text": "still",
      "start": 61.0,
      "end": 61.32
    },
    {
      "text": "defaults",
      "start": 61.32,
      "end": 61.96
    },
    {
      "text": "to",
      "start": 61.96,
      "end": 62.28
    },
    {
      "text": "one.",
      "start": 62.28,
      "end": 64.6
    },
    {
      "text": "We",
      "start": 64.6,
      "end": 64.92
    },
    {
      "text": "kept",
      "start": 64.92,
      "end": 65.24
    },
    {
      "text": "the",
      "start": 65.24,
      "end": 65.56
    },
    {
      "text": "default.",
      "start": 65.56,
      "end": 66.92
    },
    {
      "text": "We",
      "start": 66.92,
      "end": 67.16
    },
    {
      "text": "changed",
      "start": 67.16,
      "end": 67.72
    },
    {
      "text": "its",
      "start": 67.72,
      "end": 68.04
    },
    {
      "text": "question.",
      "start": 68.04,
      "end": 69.08
    },
    {
      "text": "Is",
      "start": 69.08,
      "end": 69.4
    },
    {
      "text": "this",
      "start": 69.4,
      "end": 69.72
    },
    {
      "text": "value",
      "start": 69.72,
      "end": 70.36
    },
    {
      "text": "missing?",
      "start": 70.36,
      "end": 71.24
    },
    {
      "text": "Or",
      "start": 71.24,
      "end": 71.48
    },
    {
      "text": "is",
      "start": 71.48,
      "end": 71.72
    },
    {
      "text": "it",
      "start": 71.72,
      "end": 71.96
    },
    {
      "text": "zero?",
      "start": 71.96,
      "end": 72.36
    }
  ]
} as const;
