import './native-living-forms.css';
import { useEffect, useMemo, useState } from 'react';
import { AsciiRenderer, type AsciiRendererSettings, type RendererReport } from './native-ascii-renderer';
import { createForm, type FormName } from './native-living-form-source';

export const nativeLivingFormSettings: Readonly<AsciiRendererSettings> = {
  cellSize: 9, exposure: 0.86, gamma: 0.95, globalContrast: 1.55,
  directionalContrast: 1.65, invert: false, colorMap: 'hybrid', sourceChroma: 0.12,
  glyphs: ' .,:;i|/\\()ox%#@', motion: 0.7, paused: false,
};
export interface NativeLivingFormProps {
  form?: FormName;
  seconds?: number;
  settings?: Partial<AsciiRendererSettings>;
  onReady?: (report: RendererReport) => void;
}

/** The original TSL renderer and form factory, with the original presentation. */
export function NativeLivingForm({ form = 'Strata', settings, onReady, seconds }: NativeLivingFormProps) {
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0)) throw new Error('NativeLivingForm seconds must be finite and nonnegative.');
  const adapter = useMemo(() => createForm(form), [form]);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(media.matches || document.hidden);
    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return <AsciiRenderer seconds={seconds} adapter={adapter} settings={{ ...nativeLivingFormSettings, ...settings, paused: still || settings?.paused === true }} onReady={onReady} />;
}
