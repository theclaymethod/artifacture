import React from 'react';
import { PosterCanvas } from '../../visual-explainer-mdx/components';

export default function PosterCardExample() {
  return (
    <PosterCanvas eyebrow="poster command" footer="React source -> generated HTML -> PNG capture" stat="1:1" title="Generated Poster">
      <p>
        Fixed-canvas explainers can use React components and Tailwind while keeping HTML as a generated artifact.
        The PNG is captured from the verified generated page.
      </p>
    </PosterCanvas>
  );
}
