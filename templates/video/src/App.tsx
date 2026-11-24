import { GpuCanvas } from '@artifacture/gpu';
import { liquidPrismScene } from '@artifacture/gpu/scenes';
import { LieflatChart } from '@artifacture/kit';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

function initialSeconds(): number {
  const param = new URLSearchParams(window.location.search).get('t');
  const parsed = param ? Number.parseFloat(param) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function timelineState(seconds: number) {
  const duration = 3.0;
  const progress = clamp01(seconds / duration);
  const morph = progress;
  const yaw = 0.45 - progress * 0.9;
  const pitch = 0.18 + Math.sin(progress * Math.PI) * 0.24;
  return {
    progress,
    morph,
    yaw,
    pitch,
    metrics: [
      { label: 'Morph phase', value: Math.round(morph * 100) },
      { label: 'Uniform stability', value: 100 },
      { label: 'Camera orbit', value: Math.round(progress * 90 + 10) },
    ],
  };
}

declare global {
  interface Window {
    __seek?: (seconds: number) => Promise<void>;
  }
}

export function App() {
  const [seconds, setSeconds] = useState<number>(initialSeconds);
  const state = timelineState(seconds);

  useEffect(() => {
    window.__seek = async (nextSeconds: number) => {
      flushSync(() => {
        setSeconds(nextSeconds);
      });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    };
    return () => {
      delete window.__seek;
    };
  }, []);

  return (
    <main className="video-stage" data-ve-theme="iso" data-video-time={seconds.toFixed(3)}>
      <GpuCanvas
        scene={liquidPrismScene}
        seconds={seconds}
        allowMotionUnderReduced
        label="Deterministic liquid prism keyframe driven by __seek(seconds)"
        params={{
          morph: state.morph,
          yaw: state.yaw,
          pitch: state.pitch,
          zoom: 0.96,
          offsetX: 0.3,
        }}
        style={{ position: 'absolute', inset: 0 }}
      />

      <aside className="video-hud">
        <div>
          <div className="video-timecode">T = {seconds.toFixed(2)}S</div>
          <h1 className="video-title">Seek-deterministic WebGPU composition</h1>
          <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.5, color: 'var(--ve-muted)' }}>
            Both the shader uniforms and chart bars derive strictly from the scrubbed timestamp.
          </p>
        </div>

        <LieflatChart
          title="Keyframe telemetry (%)"
          spec={{
            kind: 'rung-bars',
            unit: 25,
            unitLabel: '%',
            data: state.metrics,
          }}
        />
      </aside>
    </main>
  );
}
