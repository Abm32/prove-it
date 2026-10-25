# PROVE IT — agent instructions

Chat dares the streamer, an AI referee calls it, the clip is the receipt.
Entry for the Codex x TwitchCon Hackathon (deadline Nov 2 2026). Read `docs/superpowers/specs/2026-10-26-prove-it-design.md` before any task; it is the source of truth for scope.

## Stack (fixed)
- Node 22+, TypeScript strict, ESM. Single process.
- Server: Fastify. Static UI: vanilla TS + CSS bundled with esbuild (no React).
- DB: better-sqlite3 (file `data/prove-it.db`).
- Twitch: EventSub over WebSocket + Helix via plain `fetch`. No twurple/tmi.
- OpenAI: official `openai` SDK. Vision model and whisper model names come from env (`OPENAI_VISION_MODEL`, `OPENAI_STT_MODEL`).
- Tests: `node --test` (node:test). Fixtures for Twitch payloads live in `test/fixtures/`.

## Commands
- `npm run dev` — tsx watch server + esbuild watch UI
- `npm run build` — tsc + esbuild
- `npm test` — node --test
- `npm run lint` — tsc --noEmit

## Rules
- Never commit secrets. All config via env; keep `.env.example` current.
- Model interprets, code decides. Verdict logic (PASS/FAIL/appeal) is deterministic and unit-tested; the model only returns `{progress, evidence, done, confidence}`.
- Every Twitch/OpenAI call goes through `src/twitch/helix.ts` or `src/ai/*.ts`; no ad-hoc fetches elsewhere.
- Write the test first for state-machine, parser, verdict and EventSub handling changes. Run `npm test` before declaring a task done.
- Keep files small and named by domain: `src/twitch/`, `src/referee/`, `src/ai/`, `src/web/`, `ui/overlay/`, `ui/dash/`.
- Append a dated bullet to `docs/codex-log.md` describing what you built in each task.
- Use the `twitch-eventsub` skill in `.agents/skills/` for payload shapes, scopes and Twitch CLI mock commands.
- Do not add features beyond the spec's Scope section. Note ideas under "Next" in README instead.
