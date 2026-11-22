# Stream Toolz – Research and plan

**Renamed 2026-10-28** from "ReadMyChat" to "Stream Toolz by Maldö": the app will hold more tools for streamers. "ReadMyChat" stays the name of the chat reader, its first module. The data folder of the old name moves over on the first start (`adoptDataFolder`, as in GT Toolz), so the login, the OBS address and the settings stay. The internal prefix is `stz` since the modules (`window.stz`, `stz:` IPC channels, `app://stz`, `STZ_*` variables, `stz-` elements); the `RMC_*` variables still work as a fallback.

Kickoff 2026-10-22. The brief: a Twitch chat reader that reads the chat aloud, with Piper as the voice, a pause between messages, spam detection as a nice-to-have, and the user's own Twitch app (Client ID and secret, entered with a guide and stored encrypted). Everything local, as in GT Toolz.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Output | **Both**, chosen in the setup assistant: OBS browser source or an audio device | The OBS source puts the sound only into the stream with its own mixer channel; the device output works without OBS. Supporting both costs little. |
| Default audience | **Everyone** (with filters on) | What most streamers expect. Subs/VIPs/mods only and a channel points reward stay selectable. |
| Chat transport | **EventSub WebSocket** (`channel.chat.message`) | Twitch recommends EventSub for reading chat; IRC is still active but Twitch's migration guide points away from it, and Streamer.bot removed IRC in v1.0.5. |
| Login | **Device code flow with the streamer's own app of type "Public"**: only the Client ID, no secret; the streamer confirms a code on twitch.tv/activate; scopes `user:read:chat` and `moderator:read:followers` (follows only); since 2026-10-28 only those of the modules that are on ([04-modules.md](04-modules.md)) | Decided 2026-10-22, see "Login decision" below. |
| Login data | Electron `safeStorage` (DPAPI on Windows), in the user profile | Bound to the Windows user account; nothing is written without system encryption. |
| Stack | Electron 43 + Angular 22 (zoneless, signals, NgRx Signal Stores), as GT Toolz | Same, proven setup; parts are copied, not shared. |

## Login decision (2026-10-22)

The brief asked for the user's own app with Client ID and secret. Three other ways were looked at; the user decided:

| Way | Why not / why |
| --- | --- |
| Anonymous IRC (`justinfan…`, no app) | Works (tested live), but is not documented by Twitch (the IRC docs require a token with `chat:read`), and the Terms of Service forbid access "by means of any robot, spider, scraper, crawler or other automated means" (as quoted in the developer forum, 2017); API access is covered separately by the Developer Agreement. A grey area, not for a tool under Maldö's name. |
| One shared Public app of Maldö's | Easiest for streamers, but anyone can use a Public Client ID (it has no secret) and request other scopes with it; Twitch can suspend a misused app, which would stop it for every user. The user did not want their app to be blocked because of others. |
| Own app with secret (authorization code flow) | Built first; replaced: a secret to protect and hide on stream, an exact redirect URL, a local callback page. |
| **Own app of type Public, device code flow** | **Chosen**: each streamer registers their own app (about three minutes), enters only the Client ID, confirms a code on twitch.tv/activate. No secret, nothing depends on Maldö, officially documented by Twitch. No other way is supported. |

Data responsibility: the login and the chat go directly between Twitch and the streamer's PC; Maldö receives nothing. Each streamer accepts the Developer Agreement for their own app.

## Facts checked (2026-10-22)

- **EventSub chat**: `channel.chat.message` v1 needs `user:read:chat` from the reading user when the WebSocket transport is used. Condition: `broadcaster_user_id` (channel) and `user_id` (reader). Moderation events with the same scope: `channel.chat.message_delete`, `channel.chat.clear_user_messages`, `channel.chat.clear`. Subscriptions must be created within 10 s of `session_welcome`; `session_reconnect` hands over a new URL, and the old socket stays until the new one says welcome. Sources: [Twitch announcement](https://discuss.dev.twitch.com/t/available-today-twitch-chat-on-eventsub-an-api-for-sending-chat-and-the-conduit-transport-method-for-eventsub/54596), [IRC migration guide](https://dev.twitch.tv/docs/chat/irc-migration/).
- **Fragment types**: text, emote, mention, cheermote; a `gif` fragment was added in July 2026 ([change log](https://dev.twitch.tv/docs/change-log/)). Unknown types are treated as decoration (not read).
- **Registering an app** requires two-factor authentication on the Twitch account. Form fields: Name, OAuth Redirect URLs (required, unused by the device code flow), Category, Client Type (Confidential/Public). A Public app has no secret; Twitch recommends Public for apps on open platforms "such as windows". No review step for such apps (reviews exist for Extensions).
- **Token hygiene**: Twitch asks apps to validate tokens at start and every hour (`/oauth2/validate`). Public clients refresh without a secret; their refresh tokens are one-time use and expire after 30 days unused (then the streamer confirms a new code).
- **Device code flow** (getting-tokens-oauth): `POST /oauth2/device` with `client_id` and `scopes` returns `device_code`, `user_code`, `verification_uri`, `expires_in` (1800), `interval` (5); `POST /oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` answers `authorization_pending` until the streamer confirmed. An unknown Client ID answers `{"status":400,"message":"invalid client"}` (checked live).
- **OBS**: with "Control audio via OBS" a browser source's audio goes to the OBS mixer instead of the desktop; monitoring ("Monitoring Enabled", in older OBS "Monitor and Output") lets the streamer hear it. OBS only mixes audio of sources in the active scene, so the source belongs in every scene (paste as reference). Forum reports of silent browser audio exist, so the app has a test button. The texts in the app use the labels from OBS's own locale files (checked 2026-10-22 against obs-browser 2.26.9).
- **OBS reconnect**: Chromium's `EventSource` retries a lost connection by itself, but gives up for good after an error answer (seen live 2026-10-22: a second ReadMyChat with another key on the same port answered 404, and the source stayed silent after the right app came back). The player therefore reconnects on its own, slower each time (2 s up to 30 s). A page that never loaded (OBS started before the app) cannot do that: OBS does not retry a failed page load, so the app tells the streamer to press "Refresh cache of current page" once.
- **Piper**: the 2023.11.14-2 release of rhasspy/piper (MIT, contains espeak-ng under GPL) is what GT Toolz vetted. Same voice packages, pins and checksums as GT Toolz; not re-checked for newer Piper releases.

## Channel events (decided 2026-10-22)

The user asked for follows, subs (Prime or normal), gifted subs and raids. Checked against the EventSub reference on 2026-10-22:

- **Subs, gifted subs, raids** come as `channel.chat.notification` (v1), which needs the same `user:read:chat` scope as the chat. `notice_type` `sub` has `sub.is_prime`; `resub` has `cumulative_months`, `is_prime` and the viewer's text in `message`; `community_sub_gift` has `total`, and each single `sub_gift` of it carries `community_gift_id` (those are not read again, so a gift of 10 is one announcement); `raid` has `viewer_count`. `gift_paid_upgrade` and `prime_paid_upgrade` count as a sub. `shared_chat_*` notices and events with another `source_broadcaster_user_id` belong to other channels and are ignored.
- **Follows** come as `channel.follow` (v2), which needs `moderator:read:followers` and `moderator_user_id`: the broadcaster's own account, or a moderator of the channel. A login from before that scope keeps reading the chat; the events page asks for one new login. Without the right (another channel, not a moderator) the status says so and the chat runs on.
- **Order**: events wait in front of the chat (after earlier events) and a full queue drops chat first. They have no mod delay and are read in the main language.
- **Spam**: each follower once per app run, at most 5 follows a minute; ignored users and blocked words (also in names) apply. A resub's text is cleaned like chat; a blocked word drops only that text.

## How a message flows

1. EventSub notification → `chatMessageFromEvent` (defensive parse) → `ChatReader.receive`.
2. `ChatFilter.check`: shared chat, own messages, ignored users, audience/reward, commands, blocked words, links, emote-only, duplicates, limit per person. Skipped messages get a reason shown in the history.
3. `spokenMessage`: emotes and emoji out, mentions as names, links as "Link", repeats shortened, cut at a word.
4. `detectLanguage` (`modules/readmychat/src/language.ts`): German or English from function words, umlauts and English contractions; words used in both languages ("so", "was", "stream") count for neither. Undecided messages ("gg", "KEKW") get the main language. Off: every message gets the main language.
5. `ReadQueue`: mod delay (`readyAt`), oldest dropped beyond the maximum.
6. Reader loop: the voice for the message's language (none installed: the main language's voice), the name in front ("sagt"/"says" in the message's language; by default always, optionally only when the speaker changed), the voice renders the parts with fixed comma/sentence pauses, the clip plays on the output, then the pause between messages.
7. Moderation events remove queued messages or stop the one being read.

## Phases

1. **Done (2026-10-22)**: skeleton, Twitch app guide and login, EventSub chat, reading with pauses, both outputs, filters and moderation, setup assistant, DE/EN.
2. **Done (2026-10-22, second round)**: stack traces mapped to TypeScript in the log (no obfuscation, see docs/02); the next message is rendered while the current one plays; system-wide shortcuts (pause, skip, clear); nicknames and pronunciations; settings changed by the app reach the UI.
   **Done (third round)**: login tested with a real Public app; per-message language detection with a voice per language (`settings.voices`, the old `voiceId` migrates to the main language); the name is read in front of every message by default.
   **Done (fourth round)**: the OBS source reconnects by itself after an error answer and reloads after an app update; Twitch events (follows, subs, Prime, resubs, gifted subs, raids) with their own page.
   **Next**: a live test of the events (needs a new login for follows) and with OBS; a nickname straight from the chat history; voices beyond Piper and Kokoro (research running).
3. **Later**: installer (electron-builder after vetting, fuses, code signing), Linux and macOS.

## Not tested yet

- The real Twitch login and EventSub connection: no Twitch app was available while building. The code login (with Twitch's answers stubbed), the event parsing and the reader are covered by unit tests; Twitch's "invalid client" answer was checked live.
- A real OBS instance: the browser source was exercised with a script that behaves like it (connect, fetch clip, report the end).
