# The guided-review plugin

The guided review of the trust-map explainer (`guided-review.tsx`, `typed-diagrams.tsx` and their CSS) adapts patterns from the `guided-review` plugin by Samyak Jain, <https://github.com/samyakjain0606/awesome-learning-material> (folder `guided-review`), which its plugin manifest licenses as MIT. No code was copied. The adapted patterns:

- the chapters of the change: one idea each, titled as a plain action, in reading order (core, supporting, wiring, data, docs, then generated files and tests); every changed non-test file in one chapter; an automatic Tests chapter outside the review progress; generated files in their own chapter;
- the chapter layout: the explanation beside the files, sticky on a wide screen, stacked on a phone; one or two paragraphs of 25 to 60 words;
- "look closely" flags pinned to a line, at three levels (risk, question, nit), each with its trigger, and none when there is nothing verified to flag;
- a Reviewed box per chapter, kept per PR head in the browser;
- concrete checks before you approve: a command, lines to read, a file to compare or real inputs;
- a list of every changed file in GitHub's order;
- the shapes of the sequence and state diagrams, with added, changed, removed and same statuses behind a Before / After switch, and elements that link to their chapter.

Artifacture's version takes every flag and every file status from understando's derived data, never from a model's reading of the diff.

MIT License

Copyright (c) Samyak Jain

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
