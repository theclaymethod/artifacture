export type { LaunchedVerifyBrowser, LaunchVerifyBrowserOptions } from './browser.ts';
export {
  buildWebGpuLaunchArgs,
  launchVerifyBrowser,
  resolveChromiumBinary,
  settlePageForCapture,
} from './browser.ts';
export type { PlaceholderHit, ProjectCheckReport } from './check.ts';
export { runProjectChecks } from './check.ts';
export type {
  GeometrySummary,
  GeometryThresholds,
  GeometryViolation,
  RawElementMetric,
} from './geometry.ts';
export {
  auditPageGeometry,
  DEFAULT_GEOMETRY_THRESHOLDS,
  evaluateGeometryIssues,
} from './geometry.ts';
export type {
  CaptureEntry,
  ReviewOptions,
  ReviewReport,
  ReviewSurface,
  VideoDeterminismReport,
} from './review.ts';
export { runReview } from './review.ts';
export type { PngMetrics, WebGpuCanvasReport, WebGpuInspection } from './webgpu-check.ts';
export { analyzePngBuffer, inspectWebGpuSurface } from './webgpu-check.ts';
