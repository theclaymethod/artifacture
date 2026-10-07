import React from 'react';
import { GraphicSlide } from '../../visual-explainer-mdx/components';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import theme from '../../plugins/visual-explainer/templates/iso-motion-theme.css?raw';
import { slide } from './shared-graphics-source';

export default function SharedGraphicsPoster() {
  return <><style>{themes + theme}</style><main data-ve-poster style={{ width: 1920, height: 1080 }}><GraphicSlide slide={slide} /></main></>;
}
