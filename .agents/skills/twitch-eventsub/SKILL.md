---
name: twitch-eventsub
description: Twitch EventSub (WebSocket) + Helix patterns for PROVE IT — scopes, subscription types, payload shapes, mock testing with Twitch CLI.
---

# Twitch EventSub + Helix cheat sheet

## OAuth (Authorization Code grant)
- Authorize: `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…`
- Token: `POST https://id.twitch.tv/oauth2/token` (client_id, client_secret, code, grant_type=authorization_code, redirect_uri) → `{access_token, refresh_token, expires_in, scope[]}`
- Refresh: same endpoint with grant_type=refresh_token.
- Validate: `GET https://id.twitch.tv/oauth2/validate` header `Authorization: OAuth <token>` → `{client_id, login, user_id, scopes[], expires_in}`. Validate hourly.
- Scopes we need (space-separated, URL-encoded):
  `channel:manage:redemptions channel:read:redemptions bits:read channel:manage:polls channel:read:polls user:read:chat user:write:chat user:bot channel:bot clips:edit channel:manage:broadcast moderator:manage:chat_messages`

## Helix basics
- Base `https://api.twitch.tv/helix`. Headers: `Authorization: Bearer <user token>`, `Client-Id: <client id>`, `Content-Type: application/json`.
- Rate limit: 800 points/min per client; 429 → back off using `Ratelimit-Reset` header.
- Endpoints used:
  - `GET /users` → `{data:[{id, login, display_name, profile_image_url}]}`
  - `POST /channel_points/custom_rewards?broadcaster_id=` body `{title, cost, is_user_input_required:true, prompt, background_color}` → reward id. Max 50 rewards; title must be unique. Only rewards created by this client_id can be fulfilled/refunded by it.
  - `PATCH /channel_points/custom_rewards/redemptions?broadcaster_id=&reward_id=&id=` body `{status:"FULFILLED"|"CANCELED"}` (CANCELED refunds points).
  - `POST /chat/messages` body `{broadcaster_id, sender_id, message, reply_parent_message_id?}` (needs user:write:chat + user:bot/channel:bot). 500 char max.
  - `POST /chat/messages/pin` (Pinned Chat, GA May 2026) body `{broadcaster_id, moderator_id, message_id, duration_seconds}`; `DELETE /chat/messages/pin?broadcaster_id=&moderator_id=`. If pin fails (scope/beta), fall back to a normal chat message — never block on it.
  - `POST /clips?broadcaster_id=&has_delay=false` → `{data:[{id, edit_url}]}`; clip is ready ~15 s later: poll `GET /clips?id=` until `data[0].url` present. Stream must be live.
  - `POST /streams/markers` body `{user_id, description}` (channel:manage:broadcast). Stream must be live and VOD enabled.
  - `POST /polls` body `{broadcaster_id, title, choices:[{title}], duration}` (duration 15–1800 s). `PATCH /polls` body `{broadcaster_id, id, status:"TERMINATED"}`.
  - `GET /streams?user_id=` → empty data when offline.

## EventSub over WebSocket
1. Connect `wss://eventsub.wss.twitch.tv/ws`. First message `session_welcome` → `payload.session.id`.
2. Within 10 s, create subscriptions: `POST /eventsub/subscriptions` body `{type, version, condition, transport:{method:"websocket", session_id}}` with the **user** token.
3. Messages: `metadata.message_type` ∈ `session_welcome | session_keepalive | notification | session_reconnect | revocation`. On `session_reconnect`, connect to `payload.session.reconnect_url`, wait for welcome, then close old socket. Keepalive timeout default 10 s; treat silence > 30 s as dead → reconnect + resubscribe.
4. Dedupe by `metadata.message_id`.

### Subscriptions we use
| type | version | condition |
|---|---|---|
| `channel.channel_points_custom_reward_redemption.add` | 1 | `{broadcaster_user_id, reward_id?}` |
| `channel.chat.message` | 1 | `{broadcaster_user_id, user_id}` |
| `channel.cheer` | 1 | `{broadcaster_user_id}` |
| `channel.poll.end` | 1 | `{broadcaster_user_id}` |
| `stream.online` / `stream.offline` | 1 | `{broadcaster_user_id}` |

### Payload shapes (event fields we read)
- redemption.add: `{id, broadcaster_user_id, user_id, user_login, user_name, user_input, status:"unfulfilled", reward:{id,title,cost,prompt}, redeemed_at}`
- chat.message: `{message_id, broadcaster_user_id, chatter_user_id, chatter_user_login, chatter_user_name, message:{text, fragments[]}, message_type, badges[], cheer?:{bits}, reply?}`
- cheer: `{is_anonymous, user_id, user_login, user_name, broadcaster_user_id, message, bits}`
- poll.end: `{id, broadcaster_user_id, title, choices:[{id,title,votes,channel_points_votes}], status:"completed"|"archived"|"terminated", started_at, ended_at}`
- stream.online: `{id, broadcaster_user_id, type:"live", started_at}`

## Local mocking with Twitch CLI
- Install: https://dev.twitch.tv/docs/cli/ (`twitch` binary).
- Mock WebSocket server: `twitch event websocket start-server` (listens on `ws://127.0.0.1:8080/ws`, mock Helix on `http://127.0.0.1:8080/eventsub/subscriptions`). Point the app at it via env `TWITCH_EVENTSUB_WS_URL` and `TWITCH_EVENTSUB_SUB_URL`.
- Fire events: `twitch event trigger channel.channel_points_custom_reward_redemption.add --transport=websocket -u <user_input text>`; `twitch event trigger channel.cheer --transport=websocket`; `twitch event trigger channel.poll.end --transport=websocket`.
- Generate fixture JSON without a server: `twitch event trigger <type> --transport=websocket --no-config` prints the message; save under `test/fixtures/`.
- If the CLI is not installed, hand-write fixtures from the shapes above; keep them minimal but schema-correct.
