# GPU data visualization

## Mapping contract

Before implementation, write a table with source field, type, unit, domain, transform, visual channel, clamp behavior, missing-value behavior, and legend label.

Use position, height, color, opacity, size, orientation, density, and motion only when the channel remains interpretable. Do not use decorative noise to alter data geometry unless it is visibly separated and documented.

## Data preparation

- Validate the source file, row count, field types, missing values, and domain before uploading buffers.
- Normalize on the CPU when the domain is static and doing so improves inspectability.
- Use typed arrays and update ranges rather than reconstructing geometry each frame.
- Preserve original values for tooltip, table, export, and accessibility paths.
- Use stable IDs for selection and hover.

## Common structures

- Height field: regular grid positions plus scalar height; use a separate color scale and provide axes or scale labels.
- Point cloud: instanced or point attributes for position, value, category, size, and selection state.
- Flow field: vector texture or buffer; separate vector direction/magnitude from decorative particle advection.
- Density field: aggregate with a declared kernel and bandwidth; never imply raw observations are a continuous measured surface.
- Time surface: map time monotonically and preserve temporal direction during camera movement.

## Truthfulness and accessibility

- Choose a categorical scale for unordered groups, a sequential scale for ordered magnitude, a diverging scale only around a meaningful midpoint, and a cyclical scale only for a genuinely periodic domain.
- Do not substitute a decorative or rainbow gradient for a data scale. Preserve monotonic perceived lightness across a sequential domain, order each arm of a diverging scale away from its midpoint, and make a cyclical scale close continuously without implying a false global minimum or maximum.
- Keep legends, annotations, units, filters, and selected values in the DOM.
- Provide a table, textual summary, or equivalent accessible representation.
- Avoid perspective and lighting that invert perceived magnitude.
- Test color scales for contrast, grayscale interpretation, and color-vision robustness. Add labels, shape, pattern, or position when hues may converge.
- Freeze decorative animation when users inspect exact values.
