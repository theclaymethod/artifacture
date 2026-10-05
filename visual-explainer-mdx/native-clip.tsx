import React, { useId } from 'react';
import { validateNativeClipAsset, type NativeClipAsset } from './native-asset';
export { validateNativeClipAsset, type NativeClipAsset } from './native-asset';
export type NativeClipPlacement = Readonly<{ start: number; duration: number; mediaStart?: number; track?: number }>;

function mediaUrl(baseUrl: string, file: string) {
  if (baseUrl !== String(baseUrl) || !baseUrl) throw new Error('Native media requires an HTTP(S) or relative asset base URL.');
  const base = baseUrl.replace(/^\.\//, '');
  if (!base || /[\s\\?#]/.test(base) || /(^|\/)\.\.?($|\/)/.test(base) || (/^[a-z]+:/i.test(base) && !/^https?:\/\//i.test(base)) || base.startsWith('//')) throw new Error('Native media requires an HTTP(S) or relative asset base URL.');
  return `${base.replace(/\/$/, '')}/${file}`;
}

export function NativeClip({ asset: input, baseUrl, placement }: { asset: NativeClipAsset; baseUrl: string; placement?: NativeClipPlacement }) {
  const id = useId().replace(/:/g, '');
  const asset = validateNativeClipAsset(input);
  if (placement && (![placement.start, placement.duration, placement.mediaStart ?? 0].every(Number.isFinite) || placement.start < 0 || placement.duration <= 0 || (placement.mediaStart ?? 0) < 0 || (placement.mediaStart ?? 0) + placement.duration > asset.duration || (placement.track !== undefined && (!Number.isSafeInteger(placement.track) || placement.track < 0)))) throw new Error('Native clip placement must fit its encoded media range.');
  return <video id={`ve-native-${id}`} className={placement ? 'clip' : undefined} src={mediaUrl(baseUrl, asset.video)} aria-label={asset.title} controls={!placement} playsInline muted={placement && !asset.hasAudio} preload="metadata" poster={mediaUrl(baseUrl, asset.poster)} data-has-audio={asset.hasAudio ? 'true' : undefined} data-start={placement?.start} data-duration={placement?.duration} data-media-start={placement?.mediaStart ?? (placement ? 0 : undefined)} data-track-index={placement?.track} style={{ display: 'block', width: '100%', aspectRatio: `${asset.width}/${asset.height}`, objectFit: 'contain' }} />;
}

export function NativeStill({ asset: input, baseUrl, at }: { asset: NativeClipAsset; baseUrl: string; at?: number }) {
  const asset = validateNativeClipAsset(input);
  const still = at === undefined ? undefined : asset.stills.find(item => item.seconds === at);
  if (at !== undefined && !still) throw new Error(`No selected native still at ${at}s. Add it to the render job and render again.`);
  return <img src={mediaUrl(baseUrl, still?.image ?? asset.poster)} alt={asset.title} width={asset.width} height={asset.height} style={{ display: 'block', width: '100%', height: 'auto' }} />;
}
