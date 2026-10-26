# Devpost submission — PROVE IT

## Project name

PROVE IT

## Tagline (≤ 60 characters)

Chat dares the streamer. A referee calls it.

## Description

### Inspiration

Stream chat already asks creators to attempt challenges, but viewers cannot tell whether a challenge was completed or how the decision was made. PROVE IT turns that request into a timed, visible dare with evidence and a review path.

### What it does

A viewer submits a dare in chat or redeems a Channel Points reward on an eligible channel. The streamer shares the game/display and audio from the dashboard. PROVE IT samples frames and transcribes audio while a dare is active. The overlay shows the dare, countdown, confidence, and evidence. Two consecutive high-confidence completion ticks produce PASS; the deadline produces FAIL. On a live stream, a pass saves a marker and, where available, a Twitch Clip. Chat can appeal a fail. Affiliate and Partner channels use Twitch Polls; any channel can use the chat jury with `!overrule` and `!uphold`.

For non-Affiliate channels, viewers submit free `!dare <challenge>` commands. This is the mode used in the verified live demo. Gemini provides dare parsing and vision; Groq transcribes speech. The dashboard’s **Ref hears** line displays the latest non-empty transcription so the streamer can check the audio input.

### How we built it with Codex

We built the app in a continuing Codex session with repository instructions, a Twitch EventSub skill, small domain-focused TypeScript modules, and `node:test` coverage. The AI returns structured interpretations; a pure deterministic state machine applies the pass, deadline, appeal, and jury rules. The dated build history is in `docs/codex-log.md`; the session identifier is recorded in `docs/CODEX_SESSION.md`.

### Twitch surfaces used

- OAuth and Helix Get Users for channel identity and broadcaster capability detection.
- Channel Points custom rewards and redemption fulfillment/refund when supported.
- EventSub WebSocket: `channel.channel_points_custom_reward_redemption.add`, `channel.chat.message`, `channel.cheer`, `channel.poll.progress`, `channel.poll.end`, `stream.online`, and `stream.offline`.
- Helix Send Chat Message and Pinned Chat Messages.
- Helix Create Poll for Affiliate/Partner jury votes.
- Helix Create Clip/Get Clip where available, plus Create Stream Marker for the pass receipt.

### Challenges

The initial Gemini model was retired for new users, so we updated the default and preserved provider errors for diagnostics. The demo channel was not Affiliate, so Channel Points, Bits, Clips, and Twitch Polls could not be assumed; we added free chat dares, a chat jury, and marker receipts. Timesliced WebM chunks after the first lacked file headers, so capture now records standalone five-second files. System audio alone missed the streamer’s voice, and multiple MediaRecorder tracks were unreliable, so mic and display audio are mixed into one track. These fixes were driven by live runs.

### What’s next

Stream Together dares between rival chats, custom Power-ups as bounty currency, and an extension panel leaderboard.

## Built with

TypeScript, Node.js, Fastify, SQLite, Twitch EventSub, Twitch Helix, Gemini, Groq, OpenAI SDK, Codex

## Twitch surfaces

Channel Points custom rewards, EventSub WebSocket, Helix chat messages and pinned chat, Twitch Polls, Clips, and Stream Markers. Chat-mode dare entry and jury voting work through Twitch chat on any channel.

## Codex session ID

Use the session identifier placeholder and lookup instructions in [`docs/CODEX_SESSION.md`](CODEX_SESSION.md): **[paste recorded Codex session ID here]**.

## Testing instructions for judges

### Local setup (five commands)

```sh
cp .env.example .env
npm install
npm run build
npm test
npm start
```

Open `http://localhost:3000/dash`, connect Twitch, add the overlay as a 1920×1080 OBS Browser Source, then select **Start referee** and share the game/display and microphone. Tick **Share system audio** if the browser offers it.

### No-key demo

Run `scripts/demo.sh`. It starts an isolated server with `DEV_MODE=true` and `REFEREE_MOCK=true`, exercises a pass and an appeal/jury flow, prints state, and exits without Twitch or AI keys. To preview the overlay locally, open `http://localhost:3000/overlay/?demo=1`.

For actual integrations, configure Twitch app credentials plus `AI_API_KEY` (Gemini) and `STT_API_KEY` (Groq) in `.env`.
