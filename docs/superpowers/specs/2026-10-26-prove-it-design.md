# PROVE IT — chat dares the streamer, an AI referee calls it, the clip is the receipt

Working name. Alternatives: "Side Quest", "Called Shot", "Dare Ref".

## One-liner
Viewers spend Channel Points or Bits to post a dare ("no-scope in the next 2 minutes", "say *banana* 5 times", "beat this boss without healing"). An AI referee watches the stream video + audio, shows a live countdown and confidence meter on the overlay, calls PASS/FAIL, and on PASS auto-creates a Twitch Clip + stream marker and posts the receipt in chat. Chat can appeal a call through a Twitch Poll (the jury).

## Why this wins (mapped to criteria)
- **Innovation**: no prior art for AI-adjudicated viewer dares. Donation-dares already happen informally on every stream; nobody has a referee. Competitors are all "chat votes → mini-game".
- **Impact**: streamers already do dares for money; this turns it into a repeatable, monetised loop (Channel Points → engagement, Bits → revenue). Zero-install: one OBS browser-source URL + one OAuth click.
- **Technical**: live multimodal judging (frames + audio transcript), EventSub, Helix Clips/Markers/Polls/Pinned chat, deterministic state machine around the model. Built in one long Codex thread with AGENTS.md + skills + tests.
- **Design / fun to watch**: dare card slides in, 2-minute countdown, confidence meter twitching as the model watches, big PASS/FAIL stamp, clip link. Pure spectacle in a 3-min video and on a TwitchCon stage.
- Rides the Build-Week winner pattern: model interprets, deterministic code enforces, human (jury) override at the consequential moment.

## Scope (ship this, nothing more)
### Streamer side
1. Dashboard at `/dash`: "Connect Twitch" (OAuth, scopes below) → shows channel, creates the Channel Point reward "Dare the streamer" (cost configurable, default 1000) → gives the overlay URL to paste into OBS → start/stop referee.
2. Referee input: streamer adds a second OBS output? No. Simplest: the dashboard page captures the stream via `getDisplayMedia` (screen/window + system audio) in the browser. Frames sampled 1/s (downscaled 640px), audio transcribed with gpt-realtime-whisper (or Web Speech API fallback). ponytail: browser capture, no OBS plugin. Upgrade later: OBS virtual cam / RTMP tap.
3. Streamer can veto a dare (skip) or accept; dares auto-accept after 10 s unless vetoed (config).

### Viewer side (all via Twitch, no extension)
- Redeem "Dare the streamer" with text → dare queued. Also `!dare <text>` with Bits via cheer (`channel.bits.use` / `channel.cheer`) → bigger bounty = jumps queue.
- Chat gets: "🎯 Dare #12 by @viewer: *no-scope in 2 min* — referee watching" (Send Chat Message, pinned via Pinned Chat API for the duration).
- On verdict: PASS → "✅ PROVED IT. Clip: <url>" ; FAIL → "❌ FAILED. Type !appeal (30 s)". If ≥N appeals, a Twitch Poll "Overrule the ref?" runs for 60 s; majority flips the verdict.
- Leaderboard of dare-setters and streamer's pass rate on overlay + `/board` page.

### Referee (the technical core)
- Deterministic state machine: QUEUED → ACTIVE(deadline) → JUDGING → PASS|FAIL → (APPEAL → POLL → FINAL).
- Every 1–2 s during ACTIVE: send last 3 frames + last 15 s of transcript + the dare text + the dare's parsed *success condition* (structured at dare-creation time: `{type: visual|audio|count|timed, condition, count_target}`) to a vision model. Model returns strict JSON `{progress: 0-1, evidence: string, done: bool, confidence: 0-1}`.
- Code, not the model, decides PASS: `done && confidence ≥ 0.8` sustained over 2 consecutive ticks; FAIL on deadline. Confidence drives the overlay meter.
- Dare parsing (at creation): model classifies and rejects unsafe/impossible/TOS-violating dares (drinking, self-harm, doxxing, hate) with a reason posted in chat. Streamer veto remains.
- On PASS: Helix Create Clip (needs stream live) + Create Stream Marker + chat message + pin. Clip URL shown on overlay.

### Overlay (`/overlay?token=…`, OBS browser source, transparent)
- Idle: small "Dare the streamer — 1000 pts" badge + pass-rate.
- Active: dare card (viewer avatar, dare text, bounty), countdown ring, confidence meter with live "evidence" caption from the model ("sees scope raised…"), stamp animation on verdict, clip link, appeal/poll bar.
- Must look good at 1920×1080 and 1280×720; no external fonts beyond one Google font; CSS animations only.

## Non-goals
- No Twitch Extension (review time). No native app. No payments outside Twitch Bits/Points. No multi-streamer mode (Stream Together) in v1 — note it as "next" in README. No account system beyond Twitch OAuth.

## Anti-goals (would make it a failure)
- Referee that hallucinates PASS on nothing → always require sustained confidence + evidence string shown on screen + jury override.
- Setup friction > 3 minutes.
- Demo that needs a second streamer.

## Twitch integration (concrete)
- OAuth scopes: `channel:manage:redemptions channel:read:redemptions bits:read channel:manage:polls user:read:chat user:write:chat user:bot clips:edit channel:manage:broadcast moderator:manage:chat_messages` (markers need `channel:manage:broadcast`; pinned chat per docs).
- EventSub over WebSocket (single conduit not needed for one channel): `channel.channel_points_custom_reward_redemption.add`, `channel.chat.message`, `channel.cheer`, `channel.poll.end`, `stream.online/offline`.
- Helix: Create Custom Reward, Update Redemption Status (fulfil/refund on reject), Send Chat Message, Pin/Unpin Chat Message, Create Clip, Create Stream Marker, Create Poll, Get Users.

## Stack (builder's call, change if Codex prefers)
- Node 22 + TypeScript, single process: Fastify (or Hono) server, EventSub WS client, static overlay/dashboard (vanilla TS + CSS, no framework → fewer tokens, faster for Codex), SQLite via better-sqlite3 for dares/leaderboard. OpenAI SDK for vision + whisper.
- Env: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `OPENAI_API_KEY`, `SESSION_SECRET`, `PUBLIC_URL`.
- Tests: node:test for the state machine, dare parser schema, verdict rule, EventSub payload handling (fixtures from Twitch CLI `twitch event trigger`).
- Twitch CLI mock events for local dev; real channel for video.

## Codex usage plan (this is scored)
- ONE long Codex thread for the build (record `/status` ID early, keep using that thread). Use Codex CLI 0.158 locally.
- `AGENTS.md` at root: project summary, commands, Twitch API gotchas, "never commit secrets", test-before-done.
- `.codex/skills/twitch-eventsub/` skill with the subscription payload shapes + Twitch CLI commands, so Codex sets up EventSub correctly on first try (screen-record this for the video).
- Let Codex write tests first for the referee state machine; show a red→green loop in the video.
- Keep `docs/codex-log.md`: dated bullets of what each major Codex prompt produced (judges read this; AI judging too).

## Demo video storyboard (≤3 min)
0:00 hook — streamer mid-game, chat redeems "Dare: no-scope in 2 min", card slides in, countdown starts (10 s).
0:10 confidence meter twitching with evidence captions; streamer lands it; PASS stamp; clip posts in chat (30 s).
0:40 a FAIL + chat appeals → Twitch Poll overrules (30 s).
1:10 streamer setup: OAuth click, paste overlay URL (20 s).
1:30 how it was built with Codex: AGENTS.md, skill, red/green test loop, `/status` session ID (60 s).
2:30 leaderboard + "next: rival chats dare each other in Stream Together" (20 s).

## Open calls left to the builder
- Frame capture: `getDisplayMedia` in dashboard tab (default) vs OBS virtual camera. Start with the former.
- Audio: gpt-realtime-whisper vs browser Web Speech. Start with Whisper via chunked uploads every 5 s.
- Vision model: cheapest GPT-5.x model that reads 640px frames reliably; benchmark 3 frames/tick cost ≤ $0.01/tick.
