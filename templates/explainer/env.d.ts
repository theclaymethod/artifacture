/// <reference types="vite/client" />

declare module '*.wgsl' {
  import type { ShaderSource } from 'vgpu';

  const shader: ShaderSource;
  export default shader;
}

declare module '*.mdx' {
  import type { ComponentType } from 'react';

  const MDXContent: ComponentType<{ components?: Record<string, ComponentType<unknown>> }>;
  export default MDXContent;
}
