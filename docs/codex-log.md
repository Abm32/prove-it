# Codex build log

How PROVE IT was built with OpenAI Codex (CLI 0.158, one `codex exec` thread resumed per task). Each entry = one task prompt and what Codex produced.

- 2026-10-26: Scaffolded the Node/TypeScript app, SQLite schema, Fastify health server, static UI build, and a pure deterministic referee state machine with transition and priority-queue tests.
- 2026-10-26: Added Twitch OAuth with signed state and token refresh/storage, typed Helix helpers with retry/rate-limit handling, EventSub WebSocket handling and dedupe, reward setup, chat parsing, authenticated dashboard/overlay routes, and fixture/stub tests.
