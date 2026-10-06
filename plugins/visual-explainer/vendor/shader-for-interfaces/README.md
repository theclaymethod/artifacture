# Shader for Interfaces

Shader for Interfaces is an MIT-licensed agent skill for designing, building, debugging, and visually validating focused GPU effects inside product interfaces. It covers renderer selection, contained Three.js/WebGL2/GLSL and vgpu/WebGPU/WGSL work, modest particles and data surfaces, UI integration, performance, accessibility, and browser verification.

The skill is portable across agents and frameworks. Its instructions have no runtime dependency. vgpu is optional application code and is added only when the renderer decision justifies it; Node.js is needed only for the Skills CLI, package-local vgpu tooling, or Node pixel checks.

The current release is version `0.1.0`, published `2026-08-30` with Git tag `v0.1.0`. The canonical repository is `v2space-labs/shader-for-interfaces`.

## Install

Install with the Skills CLI:

~~~bash
npx skills@latest add v2space-labs/shader-for-interfaces \
  --skill shader-for-interfaces \
  --yes
~~~

Add `--global` to install for all supported agents on the machine. For manual installation, copy the complete `shader-for-interfaces/` directory to the agent's documented skills location and keep `SKILL.md`, `references/`, `README.md`, and `LICENSE` together.

Start a new task or conversation after installation so the agent rescans available skills.

## Use it

Describe the task naturally or invoke the skill by name. For example:

### Choose a renderer

~~~text
Use shader-for-interfaces to decide whether this effect should use CSS, SVG, Canvas 2D,
Three.js/WebGL, or vgpu/WebGPU/WGSL. Do not change files. Explain the tradeoffs,
fallback, performance constraints, and browser checks.
~~~

### Build an effect

~~~text
Use shader-for-interfaces to build a restrained pointer-responsive shader behind this
pricing header. Keep text and controls in the DOM, reuse existing design tokens, support
reduced motion, and verify the real page on desktop and mobile.
~~~

### Diagnose a shader

~~~text
Use shader-for-interfaces to diagnose why this ShaderMaterial renders black after resize.
Explain the cause first, then implement the smallest safe fix and test the real page.
~~~

### Build a data surface

~~~text
Use shader-for-interfaces to map this dataset to a small GPU terrain. Preserve units,
domain, missing values, a legend, and an accessible DOM alternative. Keep decorative
motion separate from represented data.
~~~

## Scope

This skill handles focused, contained surfaces: one effect or draw, modest particles or data, and fixed quality caps informed by measurement. Dependent render targets, feedback or simulation state, formal render graphs, measured adaptive-quality controllers, and renderer migrations are outside its scope. When a request crosses that boundary, the skill should identify the unsupported requirements instead of presenting a partial system as complete.

The MIT license permits commercial and client work. Scope is based on technical complexity, not usage rights.

## Helpful context

Provide what you know; the skill should label small reversible assumptions instead of turning every missing detail into a question.

- The project and target surface.
- A screenshot, reference, or plain-language visual direction.
- The effect's UI role and content that must remain readable.
- Applicable interaction states and the condition that makes the surface ready.
- Target devices, browsers, performance constraints, and reduced-motion needs.
- Existing design tokens, palette sources, assets, and their licenses.
- For data work: fields, units, domain, missing-value behavior, and legend requirements.

## License

Shader for Interfaces is available under the [MIT License](LICENSE). The full license controls if this summary differs from its terms.
