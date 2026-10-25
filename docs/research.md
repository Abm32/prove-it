# Codex x TwitchCon Hackathon — research (2026-10-26)

## The event
- Sponsor: Amazon Advertising LLC (Twitch). Co-promoter: OpenAI (Codex). Admin: Devpost.
- Deadline: Nov 2 2026, 2:00 PM PT. Judging Nov 5–15. Top 5 shown on stage at TwitchCon San Diego Nov 15.
- Prizes: $10k / $6k / $4k / 2x $2.5k. All 5 get stage time.
- Single track, 3 suggested directions (not templates): streamer collaboration, audience participation, content enhancements.
- Criteria, equally weighted: Innovation/Idea · Potential Impact · Technological implementation (incl. *how well it uses Codex*) · Design (*easy to use and fun to watch*).
- Stage 1 pass/fail: fits theme + reasonably uses Codex + connects to Twitch.
- Judging may include **automated AI analysis** → text description and repo README matter, not only video.
- Judges are **not required to test** → the 3-min video carries the score.
- Must submit the **Codex session ID** (`/status` in the thread where most of the build happened) + video must show Codex building it.
- Extensions discouraged: 5–14 day review, judges can't install unreviewed ones. Chat / overlay / Helix / EventSub are the fast path.
- Must be built entirely inside Oct 23 – Nov 2. Other AI assistants allowed, but Codex must be the builder.

## Past Twitch hackathon winners and why they won
| Event | Winner | What made it stand out |
|---|---|---|
| TwitchCon 2018 | KnowClips (grand) | Detects chat-activity dips, auto-surfaces clips. Reacts to live signal. |
| TwitchCon 2018 | Hydrate, Twitchlight, Lights Out | **Physical / visceral spectacle**: water pump, LED strip, screen goes black. Instantly legible on video. |
| TwitchCon 2019 | OK Gamers (grand) | Voice-activated poll → live pie chart. One technical "wow" (voice trigger) + zero streamer friction. |
| Channel Points 2021 | Hydrate (winner), There's a Twitch Among Us | Viewers' money/points cause a *visible consequence* for the streamer. |
| Streamer Tools 2024 | PixelWars, tcghud, Stream Together Timeline | PixelWars: cross-community rivalry. tcghud: in-browser AI model recognising cards live (tech wow). 3 of 8 prizes went to projects riding the **newest Twitch feature** (Stream Together / Shared Chat). |
| OpenAI Build Week 2026 (Codex) | 8 winners | Patterns: narrow scope, human approval at consequential moments, model interprets / deterministic code enforces, evidence shown in UI. Judge quote on a GitLab AI winner: "feels like a product, not a hackathon project". |

Recurring winner traits:
1. One-sentence pitch; fully understood in the first 20 seconds of video.
2. Something **happens on screen** that chat caused (bits/points/raid → visible consequence).
3. Ties into Twitch money primitives (Bits, Channel Points, Hype Train, Raids) — streamer judges reward things that drive engagement/revenue.
4. Zero-install for the streamer (OBS browser-source link).
5. One real technical feat.
6. Rides a fresh platform feature.

## What competitors are already building (public GitHub, as of Oct 26)
- ChatSkins — chat overlay skin editor.
- Twitch Plays Dice Chess — chat votes among engine moves.
- ChatQuest — chat co-op quests overlay.
- Chat Writes The Laws — chat sets physics rules; **Codex patches engine at runtime**.
- RaidForge Codex Arena — boss raid; **Codex mutates game code at runtime**.
- CalledIt — measures per-viewer stream delay for fair "call it" games (clever).
- StreamPulse — chat reactions → moments/chapters/recap.
- ChatMosh — unknown.
Takeaways: field is crowded with "chat votes → mini-game" and "Codex-at-runtime" gimmicks. The *content enhancement* and *streamer collaboration* directions are under-served. Nobody visible is doing multimodal AI that watches the stream itself.

## Fresh Twitch surfaces (2026) nobody is using yet
- Pinned Chat API (GA May 2026): pin/unpin/update messages.
- `channel.custom_power_up_redemption.add` + Get Custom Power-Ups (GA May 2026; streamer-side still alpha).
- `channel.shared_chat.begin/update/end` + Shared Chat session API (Stream Together).
- Guest Star session/invite/slot API (beta).
- Create Clip From VOD (GA Feb 2026), Create Stream Marker, Create Clip.
- gif chat fragments (Jul 2026), watch streaks, gifted drops notices.
- Polls / Predictions API (create/end) — usable as a "jury".
- Twitch itself shipped AI Mid-Stream Summaries + Auto Clips (alpha) in 2026 → avoid "recap/auto-clip" as the core idea.

## OpenAI side
- gpt-realtime-2.1 / -mini (speech-to-speech), gpt-realtime-whisper ($0.017/min), gpt-realtime-translate.
- GPT-5.x vision models accept image frames; sampling 1 frame / 1–2 s from OBS is the standard pattern.
- Codex CLI 0.158 locally: subagents, skills, hooks, `codex exec`, AGENTS.md. Judges score "how well it uses Codex" → show AGENTS.md, skills, a long single thread, tests Codex wrote.

## Sources
- https://twitchcon-codex.devpost.com/ (rules, resources FAQ, forum)
- https://discuss.dev.twitch.com/t/streamer-tools-hackathon-2024-winners-and-runner-ups/61823
- https://discuss.dev.twitch.com/t/streamer-tools-hackathon-2024-bonus-prize-winners/62948
- https://twitchstreamertools.devpost.com/project-gallery (53 entries)
- https://blog.twitch.tv/en/2021/04/16/winners-and-honorable-mentions-of-the-twitch-channel-points-hackathon/
- https://blog.twitch.tv/en/2019/10/31/highlights-from-the-twitchcon-hackathon-2019/
- https://blog.twitch.tv/en/2018/11/20/twitchcon-hackathon-2018-b66ea6687032/
- https://www.remio.ai/post/openai-build-week-winners-show-what-codex-can-build-beyond-demos
- https://dev.twitch.tv/docs/change-log/ · https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
- https://discuss.dev.twitch.com/t/introducing-api-and-eventsub-support-for-custom-power-ups/64708
- https://blog.twitch.com/en/2026/05/30/everything-we-announced-at-twitchcon-rotterdam-2026/
- GitHub search "TwitchCon codex created:>2026-10-15"
