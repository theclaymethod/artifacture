# Task: Project Recap

Create a visual project recap for an engineer returning after three weeks away. Explain the current system, what changed recently, what remains risky, and the next concrete decisions.

## Repository state

The project is a local-first document indexing service:

- `collector` watches configured directories and emits changed file paths.
- `parser` extracts plain text and headings from Markdown, PDF, and HTML.
- `indexer` chunks parsed documents and writes embeddings plus metadata.
- `query-api` performs hybrid keyword/vector search and applies access filters.
- SQLite stores configuration and metadata; a local vector index stores embeddings.

## Recent work

- Incremental indexing replaced full re-indexing.
- PDF parsing moved behind a worker boundary after memory spikes.
- Access-filter checks now run before snippets are returned.

## Open risks and decisions

- Deletes are not propagated reliably when a watched directory is offline.
- The embedding model upgrade requires a migration strategy for existing vectors.
- The team has not decided whether shared indexes belong in the local process or a separate service.

## Output goals

Give the returning engineer a fast mental model, distinguish shipped changes from unresolved work, and end with the three decisions/actions that matter next. Do not invent status, owners, dates, or architecture beyond the facts above.
