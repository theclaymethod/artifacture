import React from 'react';
import { GraphicSlide, PresentationDeck, PresentationSlide } from '../../visual-explainer-mdx/components';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import theme from '../../plugins/visual-explainer/templates/iso-motion-theme.css?raw';
import { slide } from './shared-graphics-source';

export default function SharedGraphicsSlides() {
  return <><style>{themes + theme}</style><PresentationDeck title="Shared visual objects" preset="iso" reviewTools={false}>
    <PresentationSlide shortTitle="One shared picture" tone="light"><GraphicSlide slide={slide} /></PresentationSlide>
  </PresentationDeck></>;
}
