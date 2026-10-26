# PROVE IT demo video script (2:55)

Film the verified chat-mode path on a non-Affiliate channel. The dares are free chat commands; the channel jury votes in chat; successful dares receive a stream marker instead of a clip. Gemini handles dare parsing and vision, and Groq transcribes audio on their free tiers. Put the dashboard’s **Ref hears** line in frame during the audio example.

| Time | Picture / action | On-screen caption / narration |
| --- | --- | --- |
| 0:00–0:12 | Open on the stream and chat. Type `!dare open a terminal and type the word banana`; show the dare card appear and countdown begin. | **“Any channel can start a dare in chat.”** |
| 0:12–0:43 | Show the streamer open a terminal and type banana. Include the confidence meter and evidence, then the PASS stamp and chat receipt with the stream marker. | **“Gemini reads the captured frames. Two qualifying ticks make a pass.”** **“Marker saved at the moment.”** |
| 0:43–1:03 | Show `!dare say hello chat out loud`, speak the words, and briefly show Dashboard’s Ref hears transcript line before the audio PASS. | **“Groq transcribes the mic. The referee shows what it heard.”** |
| 1:03–1:38 | Submit the banana dare again but do not open a terminal. Show the deadline FAIL, the dare author typing `!appeal`, jury prompt, distinct chat voters using `!overrule` / `!uphold`, 10-second reminder, and final result. | **“A deadline fails. Chat can review the call.”** **“The author can appeal too.”** |
| 1:38–1:55 | Quick dashboard view: chat-mode instructions, capture status, overlay URL. Open `/overlay/?demo=1` as a stand-in and label it clearly; show its idle badge as the Channel Points path preview. | **“Live run: chat mode on a non-Affiliate channel.”** **“Channel Points preview: local overlay demo stand-in.”** |
| 1:55–2:40 | Codex-build segment: show `AGENTS.md`, `.agents/skills/twitch-eventsub/SKILL.md`, `docs/codex-log.md` with 13 dated task entries, `docs/CODEX_SESSION.md`, and terminal output from `npm test` passing. | **“Built and tested in one Codex session.”** **“Typed Twitch events. Pure referee rules. Stubbed integration tests.”** |
| 2:40–2:55 | Return to the live overlay and chat receipt. End on PROVE IT title. | **“Chat dares. The ref calls it. The stream keeps the receipt.”** |

## Capture notes

- Record at 1920×1080 and keep the overlay and dashboard transcript line readable.
- In the capture picker, select the game/display and microphone. The app mixes mic and display audio into one recording track.
- For a predictable overlay shot, use `http://localhost:3000/overlay/?demo=1`; label this as a local stand-in, not a live Channel Points redemption.
- Avoid recording `.env`, API keys, OAuth tokens, or session secrets.
