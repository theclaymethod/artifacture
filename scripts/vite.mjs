import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The caller owns Vite configuration, styling, and all dependency resolution.
export function artifactureMdx() {
  return [mdx(), react(), tailwindcss()];
}
