# PROVE IT

**Chat dares the streamer. An AI referee watches the stream and calls it. The clip is the receipt.**

PROVE IT turns Twitch Channel Points and Bits into live challenges. A viewer submits a dare; the referee watches captured video and audio; a deterministic rules engine calls PASS or FAIL. On a pass, PROVE IT posts the result and creates a Twitch Clip when the channel is live. Chat can appeal a fail and overrule the ref in a Twitch Poll.

Built for the Codex × TwitchCon Hackathon 2026. This repository is the single-channel demo app.

## The 90-second version

1. **Redeem:** chat redeems the “Dare the streamer” Channel Points reward, or sends `!dare <challenge>` with Bits.
2. **Ref watches:** EventSub delivers the redemption/chat event. The browser capture samples one 640px-wide frame each second and sends five-second audio chunks. While a dare is active, Gemini judges up to two recent frames and Groq transcribes audio.
3. **Verdict:** the model reports progress, evidence, completion, and confidence. The state machine decides the outcome: two consecutive qualifying ticks pass; the deadline fails.
4. **Receipt or jury:** a pass triggers a chat message, stream marker, and a clip if the stream is live. Chat can type `!appeal`; enough distinct appeals open a 60-second Twitch Poll. A poll majority can overrule the fail.

The OBS overlay makes the action visible with a countdown, referee confidence meter, evidence captions, verdict stamp, appeal/poll status, and clip receipt.

## Twitch surfaces

### Works on any channel

PROVE IT reads `broadcaster_type` after OAuth and chooses the available entry and receipt surfaces. Affiliate features remain the preferred experience; non-Affiliate channels get the full dare, verdict, and jury loop through chat.

| Feature | Affiliate+ | Any channel |
| --- | --- | --- |
| Submit a dare | Channel Points reward or Bits `!dare` | Free `!dare <challenge>` |
| Appeal a FAIL | Twitch Poll after `!appeal` threshold | Chat jury: `!overrule` / `!uphold` |
| PASS receipt | Clip plus stream marker when live | Stream marker when live |
| Bounty and queue priority | Points and Bits; higher Bits jump the queue | Free dares, ordered by arrival |

Chat mode limits each viewer to one queued dare at a time. The referee still uses the same deterministic verdict rules in both modes.

| Viewer/streamer action | Twitch surface |
| --- | --- |
| Create and fulfill/refund the “Dare the streamer” reward | Helix Channel Points custom rewards and redemptions |
| Receive redemptions, chat, cheers, poll progress/results, and live status | EventSub WebSocket: `channel.channel_points_custom_reward_redemption.add`, `channel.chat.message`, `channel.cheer`, `channel.poll.progress`, `channel.poll.end`, `stream.online`, `stream.offline` |
| Announce dares and verdicts | Helix Send Chat Message |
| Keep the active dare visible in chat | Helix Pinned Chat Messages (best effort) |
| Save proof after a pass | Helix Create Clip and Get Clip |
| Mark the moment in the VOD | Helix Create Stream Marker |
| Let chat review a fail | Helix Create Poll and poll-end EventSub |

## Architecture

```text
Browser capture (screen + audio)
            │ JPEG frames / WebM chunks
            ▼
      Fastify server ──────────────── EventSub WebSocket / Helix
            │                                  ▲
            ├──── Gemini Vision + Groq STT      │ actions/events
            │                                  │
            ▼                                  │
 Deterministic referee state machine ──────────┘
            │
            ├── SQLite dare/tick/history store
            ├── Dashboard state + overlay WebSocket
            └── Transparent OBS overlay
```

## Model interprets, code decides

Gemini parses the dare and reports evidence; it cannot directly issue a verdict. The parser rejects unsafe, unverifyable, or policy-violating dares, including self-harm, drinking/substances, sexual or hateful content, doxxing, spending money, and challenges that cannot be verified from the captured screen/audio. The vision judge is conservative and returns structured JSON only.

The server applies the rules: PASS requires **two consecutive ticks** with `done: true` and confidence at or above 0.8. A dare that reaches its deadline fails. The streamer can veto or skip; chat can appeal a fail, and a Twitch Poll provides the jury override. Evidence is shown with each call so viewers can see what the referee used.

## Setup

### 1. Create a Twitch application

In the [Twitch Developer Console](https://dev.twitch.tv/console/apps), create an application with OAuth redirect URL:

```text
http://localhost:3000/auth/twitch/callback
```

Copy the client ID and client secret. The app requests these scopes (the Twitch authorization screen is the source of the actual grant):

```text
channel:manage:redemptions channel:read:redemptions bits:read
channel:manage:polls channel:read:polls user:read:chat user:write:chat
user:bot channel:bot clips:edit channel:manage:broadcast
moderator:manage:chat_messages
```

### 2. Get free AI keys, configure, and build

Get two free API keys: [Gemini](https://aistudio.google.com/apikey) and [Groq](https://console.groq.com/keys). No credit card is required for the free tiers used here. Put them in `.env` as `AI_API_KEY` and `STT_API_KEY`.

Use Node 24 (Node 22.13+ is supported), then create a local environment file:

```sh
cp .env.example .env
npm install
npm run build
```

Set these values in `.env`:

| Variable | Purpose |
| --- | --- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Twitch application credentials |
| `AI_API_KEY` | Gemini key for dare parsing and vision |
| `STT_API_KEY` | Groq key for speech transcription; falls back to `AI_API_KEY` if empty |
| `SESSION_SECRET` | Long random secret for OAuth state and signed cookies |
| `PUBLIC_URL` | Base URL; use `http://localhost:3000` for local development |
| `PORT`, `DATABASE_PATH` | Server port and SQLite file location |
| `AI_BASE_URL`, `AI_VISION_MODEL` | OpenAI-compatible vision/parsing endpoint and model (Gemini `gemini-3.5-flash-lite` by default) |
| `STT_BASE_URL`, `STT_MODEL` | Transcription endpoint and model (Groq `whisper-large-v3-turbo` by default) |
| `FRAMES_PER_TICK`, `TICK_MS` | Frames sent per vision tick (default 2, range 1–3) and referee interval (default 4000 ms) |
| `DARE_COST_POINTS` | Channel Points reward cost (default 1000) |
| `TWITCH_EVENTSUB_WS_URL`, `TWITCH_EVENTSUB_SUB_URL` | Optional EventSub and subscription endpoint overrides for Twitch CLI |
| `DEV_MODE`, `REFEREE_MOCK` | Local-only development routes and deterministic mock AI; keep both false in production |

**Swap providers:** any OpenAI-compatible endpoint can be used by changing `AI_BASE_URL` and `AI_VISION_MODEL`, including OpenAI, Groq, OpenRouter, and Ollama at `http://localhost:11434/v1`. Gemini’s free tier is roughly 10–15 requests per minute, so `TICK_MS` defaults to 4000 and `FRAMES_PER_TICK` to 2.

Start the built server:

```sh
npm start
```

Open [http://localhost:3000/dash](http://localhost:3000/dash), choose **Connect Twitch**, and authorize the channel. PROVE IT creates the Channel Points reward after authorization.

### 3. Add the overlay and start capture

1. Copy the overlay URL from the dashboard.
2. In OBS, add a **Browser Source**, paste that URL, and set the size to **1920 × 1080**. The overlay background is transparent.
3. In the dashboard, choose **Start referee** and share the stream/game display. In the browser’s screen-share picker, tick **Share system audio**. If that option is unavailable, PROVE IT tries the microphone as an audio source.

## Development and demo mode

Run `npm run dev` for the TypeScript server and UI watch build. For a local, deterministic end-to-end demo with no Twitch or AI credentials:

```sh
scripts/demo.sh
```

The script starts an isolated server with `DEV_MODE=true REFEREE_MOCK=true`, injects a pass and a fail/appeal/poll-overrule sequence, prints `/api/state` after each step, and shuts down. `DEV_MODE=true` exposes `/api/dev/*` and permits unauthenticated local state inspection; the routes return 404 when it is off. `REFEREE_MOCK=true` selects a deterministic parser and judge. **Do not enable either flag in production.**

Preview the broadcast UI at [http://localhost:3000/overlay/?demo=1](http://localhost:3000/overlay/?demo=1). It cycles through idle, queued, active, appeal, poll, PASS, and final overrule states without a server connection. Optional layout controls include `pos=bl|br|tl|tr`, `scale=0.5..1.5`, `idle=hide`, and `sfx=0`.

## Testing and Twitch CLI

Run the local suite and production build:

```sh
npm test
npm run lint
npm run build
```

The tests use `node:test`, SQLite in memory, and hand-written EventSub fixtures; they do not contact Twitch, Gemini, or Groq.

To exercise EventSub against the [Twitch CLI](https://dev.twitch.tv/docs/cli/), start its mock WebSocket/Helix server and point the app at it:

```sh
twitch event websocket start-server
TWITCH_EVENTSUB_WS_URL=ws://127.0.0.1:8080/ws \
TWITCH_EVENTSUB_SUB_URL=http://127.0.0.1:8080/eventsub/subscriptions \
npm run dev
```

With the mock server running, trigger representative events:

```sh
twitch event trigger channel.channel_points_custom_reward_redemption.add --transport=websocket -u "Say hello"
twitch event trigger channel.chat.message --transport=websocket
twitch event trigger channel.cheer --transport=websocket
twitch event trigger channel.poll.end --transport=websocket
twitch event trigger stream.online --transport=websocket
twitch event trigger stream.offline --transport=websocket
```

To print a fixture without a server, use `twitch event trigger <type> --transport=websocket --no-config`.

## Costs

**$0 on the free tiers used by default.** Provider free-tier quotas and rate limits can change, so dares may need a slower tick interval if a limit is reached.

## How we built it with Codex

This project was built in one continuing Codex thread. The [Codex build log](docs/codex-log.md) records each task, [session notes](docs/CODEX_SESSION.md) identify the build thread, [AGENTS.md](AGENTS.md) defines the stack and rules, and the [Twitch EventSub skill](.agents/skills/twitch-eventsub/SKILL.md) captures scopes, payload shapes, and mock commands. Tests cover the deterministic referee transitions and the network-facing adapters with stubs.

## Next

- Stream Together rival-chat dares.
- Custom Power-ups as an additional bounty currency.
- A Twitch Extension panel with the leaderboard.

## License

MIT. See [LICENSE](LICENSE).
