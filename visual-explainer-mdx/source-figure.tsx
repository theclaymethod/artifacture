import { useEffect, useMemo, useRef } from 'react';
import { prepareSourceDocument, type SourceDocument } from './source-document';
export { prepareSourceDocument };
export type { SourceDocument, SourceTiming } from './source-document';

export type SourceFigureProps = Readonly<{ asset: SourceDocument; seconds?: number; height?: number; onFrame?: (seconds: number) => void }>;

/** Native preview when seconds is omitted; externally sampled source motion when supplied. */
export function SourceFigure({ asset, seconds, height = 640, onFrame }: SourceFigureProps) {
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0)) throw new Error('SourceFigure seconds must be finite and nonnegative.');
  if (!Number.isFinite(height) || height < 200 || height > 2400) throw new Error('SourceFigure height must be 200–2400 pixels.');
  const frame = useRef<HTMLIFrameElement>(null);
  const current = useRef(seconds);
  current.current = seconds;
  const managed = seconds !== undefined;
  const html = useMemo(() => prepareSourceDocument(asset, managed), [asset, managed]);
  const seek = () => { if (current.current !== undefined) frame.current?.contentWindow?.postMessage({ type: 'artifacture:seek', seconds: current.current }, '*'); };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'artifacture:ready') seek();
      if (event.data?.type === 'artifacture:frame' && Number.isFinite(event.data.seconds)) onFrame?.(event.data.seconds);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [html, onFrame]);
  useEffect(seek, [seconds, html]);
  return <iframe ref={frame} title={asset.title} srcDoc={html} onLoad={seek} sandbox="allow-scripts" data-source-managed={managed || undefined} data-source={asset.source} data-source-revision={asset.revision} style={{ width: '100%', height, display: 'block', border: 0 }} />;
}

/** Await the actual source frame before taking a still or encoding a video frame. */
export function seekSourceFrame(frame: HTMLIFrameElement, seconds: number): Promise<void> {
  if (!Number.isFinite(seconds) || seconds < 0) return Promise.reject(new Error('Source frame time must be finite and nonnegative.'));
  if (!frame.contentWindow || frame.dataset.sourceManaged !== 'true') return Promise.reject(new Error('seekSourceFrame requires a managed SourceFigure.'));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('The native source did not acknowledge the requested frame.')); }, 15000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'artifacture:frame' || event.data.seconds !== seconds) return;
      cleanup(); resolve();
    };
    const cleanup = () => { window.clearTimeout(timer); window.removeEventListener('message', receive); };
    window.addEventListener('message', receive);
    frame.contentWindow?.postMessage({ type: 'artifacture:seek', seconds }, '*');
  });
}
