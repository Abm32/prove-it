# Codex build log

How PROVE IT was built with OpenAI Codex (CLI 0.158, one `codex exec` thread resumed per task). Each entry = one task prompt and what Codex produced.

- 2026-10-26: Scaffolded the Node/TypeScript app, SQLite schema, Fastify health server, static UI build, and a pure deterministic referee state machine with transition and priority-queue tests.
- 2026-10-26: Added Twitch OAuth with signed state and token refresh/storage, typed Helix helpers with retry/rate-limit handling, EventSub WebSocket handling and dedupe, reward setup, chat parsing, authenticated dashboard/overlay routes, and fixture/stub tests.
- 2026-10-26: Replaced the native SQLite addon with Node `DatabaseSync`, added structured dare parsing, conservative vision judging and Whisper fallback, and wired the injectable referee service to capture ingestion, Twitch events, verdicts, appeals, polls, and overlay/API state. Failed dares fulfill redemptions, consuming Channel Points because the streamer attempted the challenge.
- 2026-10-26: Added browser screen/audio capture with bounded raw upload routes, a live referee dashboard and transparent overlay, countdown/state view helpers, and isolated dev/demo routes with deterministic mock AI and a no-Twitch demo script. Final verdicts remain visible for the overlay hold before the next queued dare starts.
- 2026-10-26: Rebuilt the overlay as a broadcast fight card with a live countdown, confidence gauge, evidence ticker, appeal/poll bars, verdict stamps, synthesized optional SFX, reconnect status, and a local state-cycle preview. Tightened the dashboard with three-step onboarding, shortcut chips, verdict history, and an overlay preview link.
