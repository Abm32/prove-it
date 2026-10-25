# PROVE IT demo video shot list (2:55)

Keep the overlay large and legible in the capture. Use `scripts/demo.sh` / `?demo=1` for deterministic shots if the live channel or clip wait is unreliable. Suggested on-screen captions are in quotation marks.

| Time | Picture / action | On-screen caption / narration |
| --- | --- | --- |
| 0:00–0:10 | Open on a live game view. A Channel Points redemption arrives; the fight card expands with the dare and countdown. | **“Chat doesn’t just watch. Chat dares.”** |
| 0:10–0:40 | Show the confidence meter moving and evidence captions updating. Streamer completes the challenge; PASS stamp lands. Cut to chat message and the clip receipt/marker. | **“A ref watches the same screen and audio as the audience.”** Then **“Two clear ticks. PASS. Clip saved.”** |
| 0:40–1:10 | Present a second dare that times out. Show FAIL, `!appeal`, three appeals, then the Twitch Poll. Poll overrules; final stamp changes. | **“The model proposes. The rules decide.”** Then **“Chat is the jury.”** |
| 1:10–1:30 | Dashboard walkthrough: Connect Twitch, copy overlay URL, paste into OBS Browser Source, click Start referee, select display and tick Share system audio. | **“One OAuth click. One browser source. Share the stream.”** |
| 1:30–2:30 | Show repo and Codex build process: `AGENTS.md`, Twitch EventSub skill, state-machine tests, and a terminal red/green test run. Briefly show the architecture diagram in README. | **“Built in one Codex thread. Typed Twitch events, mocked integrations, deterministic referee tests.”** |
| 2:30–2:55 | Return to overlay/dashboard leaderboard and pass rate. End on PROVE IT title, then next direction. | **“Every dare gets a call. Every pass gets a receipt.”** End card: **“Next: rival chats dare each other in Stream Together.”** |

## Capture notes

- Record 1920×1080. Use the overlay URL directly in OBS, with the browser source set to 1920×1080.
- For the setup shot, show the browser share picker and the **Share system audio** checkbox.
- If using demo mode, use `http://localhost:3000/overlay/?demo=1` for the cycling overlay and `scripts/demo.sh` for state transitions. A demo pass has no live stream, so it intentionally shows no real clip.
- Keep captions short and avoid showing OAuth secrets, `.env`, access tokens, or the session secret.
