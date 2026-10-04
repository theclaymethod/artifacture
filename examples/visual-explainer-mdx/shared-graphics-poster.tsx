import React from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/components';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import theme from '../../plugins/visual-explainer/templates/hairline-motion-theme.css?raw';
import { diagram } from './shared-graphics-source';

export default function SharedGraphicsPoster() {
  return <><style>{themes + theme}</style><main data-ve-poster data-ve-preset="hairline" data-ve-appearance="light" className="motion-stage" style={{ width: 1920, height: 1080, boxSizing: 'border-box', padding: '78px 126px', display: 'flex', flexDirection: 'column', gap: 36 }}>
    <h1 style={{ fontSize: 86 }}>Keep the picture. Change the explanation.</h1>
    <p style={{ margin: 0, fontSize: 40, lineHeight: 1.4 }}>A poster, a slide, and a video use these same objects and connections.</p>
    <div style={{ flex: 1, minHeight: 0 }}><GraphicCanvas scene={diagram} style={{ width: '100%', height: '100%' }} /></div>
  </main></>;
}
