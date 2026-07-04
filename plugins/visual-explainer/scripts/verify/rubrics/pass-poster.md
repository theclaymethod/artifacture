Inputs:
- Exported poster PNG only.
- Do not use the live HTML preview for this pass.

Questions:
- [poster-visual-fit-squint] Does the poster preserve its intended hierarchy with one clearly dominant element and an intentional moment-of-surprise or hero number, with no text clipped at any edge and no large unexplained blank region such as a collapsed grid column?

Verdict JSON schema:
`{"pass":true,"findings":[{"check_id":"<check-id>","evidence":"PNG lower-right edge: ...","fix":"..."}]}`

Fail examples:
- The hero number is shrunk to the same weight as secondary labels.
- Body text is cut by the right canvas edge in the exported PNG.
- A full column is blank because the grid collapsed during export.
