export type GraphicPoint = Readonly<{ x: number; y: number }>;
export type GraphicRouteSegment =
  | Readonly<{ kind: 'line'; to: GraphicPoint }>
  | Readonly<{ kind: 'quadratic'; control: GraphicPoint; to: GraphicPoint }>
  | Readonly<{ kind: 'cubic'; control1: GraphicPoint; control2: GraphicPoint; to: GraphicPoint }>;
export type GraphicRouteInput = Readonly<{ start: GraphicPoint; segments: readonly GraphicRouteSegment[]; tolerance?: number }>;
export type PreparedGraphicRoute = Readonly<{ d: string; points: readonly GraphicPoint[]; cumulativeLengths: readonly number[]; length: number; tolerance: number }>;

const pointBudget = 65536;
function finitePoint(point: GraphicPoint): void {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Route points must be finite.');
}
function distance(a: GraphicPoint, b: GraphicPoint): number {
  const result = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(result)) throw new Error('Route geometry exceeds finite distance.');
  return result;
}
function midpoint(a: GraphicPoint, b: GraphicPoint): GraphicPoint {
  return { x: a.x / 2 + b.x / 2, y: a.y / 2 + b.y / 2 };
}
function polyline(points: readonly GraphicPoint[]): string {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
}

/** Prepare the exact drawn polyline and its finite distance table once. */
export function prepareGraphicRoute(input: GraphicRouteInput): PreparedGraphicRoute {
  const tolerance = input.tolerance ?? 0.1;
  if (!Number.isFinite(tolerance) || tolerance <= 0 || !input.segments.length) throw new Error('Routes need segments and a positive finite tolerance.');
  finitePoint(input.start);
  const points: GraphicPoint[] = [{ ...input.start }];
  const append = (point: GraphicPoint) => {
    const previous = points.at(-1)!;
    if (previous.x === point.x && previous.y === point.y) return;
    if (points.length >= pointBudget) throw new Error('Route exceeds its finite subdivision budget.');
    points.push({ ...point });
  };
  const flatten = (controls: readonly GraphicPoint[], depth: number) => {
    const start = controls[0], end = controls.at(-1)!;
    const chord = distance(start, end);
    const polygon = controls.slice(1).reduce((sum, point, index) => sum + distance(controls[index], point), 0);
    if (!Number.isFinite(polygon)) throw new Error('Route geometry exceeds finite distance.');
    const flatness = Math.max(0, ...controls.slice(1, -1).map(point => {
      if (!chord) return distance(start, point);
      const ux = (end.x - start.x) / chord, uy = (end.y - start.y) / chord;
      const dx = point.x - start.x, dy = point.y - start.y;
      const along = Math.max(0, Math.min(chord, dx * ux + dy * uy));
      return Math.hypot(dx - along * ux, dy - along * uy);
    }));
    if (polygon - chord <= tolerance && flatness <= tolerance) { append(end); return; }
    if (depth >= 20) throw new Error('Route tolerance cannot be met within its finite subdivision budget.');
    const levels: GraphicPoint[][] = [controls.map(point => ({ ...point }))];
    while (levels.at(-1)!.length > 1) {
      const row = levels.at(-1)!;
      levels.push(row.slice(1).map((point, index) => midpoint(row[index], point)));
    }
    flatten(levels.map(row => row[0]), depth + 1);
    flatten(levels.map(row => row.at(-1)!).reverse(), depth + 1);
  };
  let cursor = input.start;
  for (const segment of input.segments) {
    finitePoint(segment.to);
    if (segment.kind === 'line') append(segment.to);
    else if (segment.kind === 'quadratic') { finitePoint(segment.control); flatten([cursor, segment.control, segment.to], 0); }
    else if (segment.kind === 'cubic') { finitePoint(segment.control1); finitePoint(segment.control2); flatten([cursor, segment.control1, segment.control2, segment.to], 0); }
    else throw new Error('Unsupported route segment.');
    cursor = segment.to;
  }
  const cumulativeLengths = [0];
  for (let index = 1; index < points.length; index++) cumulativeLengths.push(cumulativeLengths.at(-1)! + distance(points[index - 1], points[index]));
  const route = { d: polyline(points), points, cumulativeLengths, length: cumulativeLengths.at(-1)!, tolerance };
  validateGraphicRoute(route);
  points.forEach(Object.freeze);
  return Object.freeze({ ...route, points: Object.freeze(points), cumulativeLengths: Object.freeze(cumulativeLengths) });
}

export function validateGraphicRoute(route: PreparedGraphicRoute): void {
  if (!Number.isFinite(route.tolerance) || route.tolerance <= 0 || !Number.isFinite(route.length) || route.length <= 0 || route.points.length < 2 || route.points.length > pointBudget || route.points.length !== route.cumulativeLengths.length || route.cumulativeLengths[0] !== 0) throw new Error('Invalid prepared route.');
  route.points.forEach(finitePoint);
  let cumulative = 0;
  for (let index = 1; index < route.points.length; index++) {
    const step = distance(route.points[index - 1], route.points[index]);
    cumulative += step;
    if (!step || !Number.isFinite(cumulative) || route.cumulativeLengths[index] !== cumulative) throw new Error('Invalid prepared route distance table.');
  }
  if (cumulative !== route.length || route.d !== polyline(route.points)) throw new Error('Prepared route drawing and distance table disagree.');
}

export function sampleGraphicRoute(route: PreparedGraphicRoute, fraction: number): GraphicPoint {
  if (fraction <= 0) return route.points[0];
  if (fraction >= 1) return route.points.at(-1)!;
  const desired = route.length * fraction;
  let low = 0, high = route.points.length - 1;
  while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (route.cumulativeLengths[mid] <= desired) low = mid; else high = mid; }
  const progress = (desired - route.cumulativeLengths[low]) / (route.cumulativeLengths[high] - route.cumulativeLengths[low]);
  const a = route.points[low], b = route.points[high];
  return { x: a.x * (1 - progress) + b.x * progress, y: a.y * (1 - progress) + b.y * progress };
}
