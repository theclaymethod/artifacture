# Task: Architecture Diagram

Create a visual explainer for the request-router architecture below. Draw the same concrete system, with eight named runtime nodes and the key data flows between them.

## System

VectorAtlas is a document search service for internal engineering knowledge. The production path has exactly these runtime nodes:

1. **Browser Client** sends searches and receives ranked snippets.
2. **Edge Gateway** terminates TLS, checks session cookies, and enforces a 90 requests/minute user limit.
3. **Query API** validates the search payload, chooses a search mode, and composes the final response.
4. **Embedding Worker** converts the user query into an embedding when semantic mode is requested.
5. **Vector Index** stores document chunk vectors and returns the top 80 nearest chunks.
6. **Metadata Store** stores document titles, owners, freshness timestamps, and ACL tags.
7. **Ranker Service** combines vector score, freshness, and ACL eligibility into the final top 10.
8. **Audit Stream** receives immutable search events from the Query API after each response.

## Required Flows

- Browser Client -> Edge Gateway -> Query API is the synchronous request path.
- Query API calls Embedding Worker only for semantic searches.
- Embedding Worker calls Vector Index and returns candidate chunk IDs to Query API.
- Query API reads document metadata and ACL tags from Metadata Store.
- Query API sends candidate chunks plus metadata to Ranker Service.
- Ranker Service returns the top 10 ranked results to Query API.
- Query API returns snippets through Edge Gateway to Browser Client.
- Query API writes one event to Audit Stream after the response is assembled.

## Output Goals

- Make directionality and optional semantic-only behavior clear.
- Use layout, grouping, and annotation rather than a wall of text.
- Keep all node names exactly as written above.
