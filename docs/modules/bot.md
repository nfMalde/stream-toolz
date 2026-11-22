# Chat Bot

Answers chat commands (`!discord`, `!socials`, …) in the streamer's chat and posts timed messages. The answers are
written **as the streamer's own account**: the user decided 2026-10-28 to stay with the streamer's own "Public" app
and no second bot account yet, so an answer looks like a message of the streamer's. The module is off by default.

Folder: `modules/bot/`. Id `bot`, config key `modules.bot`, IPC namespace `stz:bot:*`, `window.stz.bot`.

## The permission

The module declares the features `chat` (reading, `user:read:chat`) and `chatWrite` (`user:write:chat`). `chatWrite` is
the **first permission that writes**: the login lists it separately (`WRITING_FEATURES` in
`packages/twitch/src/features.ts`). A login from before the module was switched on lacks it; the connection then
reports `features.chatWrite === 'needs-login'` and the module's pages show a banner with "log in again" (the new
login asks for the permission; everything else keeps running meanwhile).

Messages are sent with Helix `POST /chat/messages` (`packages/twitch/src/helix.ts` `sendChatMessage`) as the
logged-in user in the connected channel. Twitch drops messages it rejects (AutoMod, a missing permission, a channel
in followers-only mode for an account that does not follow, …) and says why in its answer; that reason ends up in
the bot's log as a failed action and in the technical log as `BOT       send failed: <reason>`, never the chat text.

## What it does

- **Commands**: the first word of a message decides, case does not matter (`!Discord` works). A command has a
  trigger (lower case, `[a-z0-9_äöüß-]`, 1..32 characters, without the prefix), up to 5 aliases, an answer with the
  placeholders `{user}` (the writer's display name), `{channel}`, `{args}` (the words after the trigger) and
  `{count}` (how often the command answered; persisted as `uses`, so it survives a restart; the UI can reset it),
  a cooldown for everyone and one per person (0..3600 s each), and the minimum role (`everyone`, `subs`, `vips`,
  `mods`, `broadcaster`: mods include the broadcaster, VIPs include mods, subs include VIPs). The first command in
  the list wins when triggers overlap; the settings check drops a trigger or alias another command already has.
- **`!commands`** is built in and lists the enabled triggers (not the aliases) in the app's language; it can be
  switched off (`listCommand`). The word `commands` cannot be a command of the user's.
- **Timed messages**: a text (with `{channel}`), every 1..180 minutes, optionally only after at least N chat
  messages since the last send (so an empty chat is not spammed). A timer counts from the moment it is added or
  switched on; the module checks every 10 s.
- **Global cooldown** (0..60 s, default 2): at least this long between two answers to commands, whichever commands.
  Timed messages do not count as answers.
- **Reply in thread** (default on): the answer is a Twitch reply to the message (`reply_parent_message_id`); off: a
  plain message.
- The prefix is `!`, fixed for now.
- The bot never answers its own account's messages (its answers come back as chat messages; an answer containing
  `!x` would loop), ignores messages from other channels of a shared chat (it cannot reply there), and ignores the
  app's test messages.

## Rate limits and the send queue

Twitch allows a normal account about 20 messages per 30 seconds in a channel (100 per 30 seconds for mods and the
broadcaster; the API rejects more). The bot sends through one queue:

- at least **1.5 s between two sends** (20 per 30 s at most, so the bot stays below the limit even as a plain user);
- at most **20 answers waiting**; further ones are dropped and logged as failed (`queue-full`): a burst of commands
  must not keep the bot talking for a minute;
- one send at a time; a failed send does not block the next;
- `stop()` (module switched off, app closing) drops what waits.

The global and per-command cooldowns reduce what reaches the queue in the first place.

## Settings (`modules.bot.settings`)

| Key | What | Default |
| --- | --- | --- |
| `commands` | `{ id, trigger, response, cooldownSeconds, userCooldownSeconds, who, enabled, aliases, uses }[]`, max 200 | `[]` |
| `timers` | `{ id, text, everyMinutes 1..180, minMessages 0..100, enabled }[]`, max 50 | `[]` |
| `globalCooldownSeconds` | 0..60 | 2 |
| `prefix` | `'!'` | `'!'` |
| `replyInThread` | answer as a Twitch reply | `true` |
| `listCommand` | the built-in `!commands` | `true` |

`normalizeSettings` (`src/settings.ts`) checks everything; the UI shares its trigger check and limits
(`BOT_LIMITS`, `cleanBotTrigger`, `isValidBotTrigger` from `@stz/api`). An entry without a valid id gets a fresh
one; responses are one line, control characters removed, at most 450 characters (Twitch allows 500; the rest is
room for the placeholders' values; a rendered answer is cut at 500).

## The bridge (`window.stz.bot`)

Besides the settings calls: `status()` → `{ log, connected, canWrite, queued }` and the event `status` (sent on
every change of the log or the queue and on every Twitch status), `preview(commandId, sampleArgs)` → the rendered
answer for a sample viewer ("Zuschauer"/"Viewer") without sending, `sendTest(text)` sends a message right away (to
check the permission; logged as `test`), `resetUses(commandId)`. `canWrite` is the `chatWrite` feature state from
the last Twitch status (undefined before the first one); the UI's banners read the shell's `TwitchStore` directly.

The log keeps the last 50 actions `{ at, kind, trigger, user, outcome, text, error? }` with the outcomes `sent`,
`cooldown`, `role`, `failed`, `test`; it lives in memory only and holds chat text and names, so it never goes to
the technical log.

## UI

- `/bot/commands`: the table (trigger with aliases, answer, who, cooldowns, uses with reset, on/off, preview, edit,
  remove), the add/edit form with validation feedback (trigger, answer, aliases, role, cooldowns), the preview
  ("Wie würde die Antwort aussehen?" with sample words for `{args}`), the test message, and the banners (Twitch not
  connected, `chatWrite` needs a new login, Twitch error, and always the note that the bot writes as the own
  account).
- `/bot/timers`: timed messages (list + form) and the global settings (pause between answers, reply in thread,
  `!commands` on/off, the fixed prefix).
- `/bot/log`: the last actions, newest first.

## What leaves the PC

Only the chat messages the bot sends, to Twitch (Helix). Nothing else.

## Decisions

- Own account, no second bot account (the user, 2026-10-28). The UI says so on every page of the module.
- Cooldowns are checked after the role: a person who may not use a command starts no cooldown.
- The global cooldown counts from the decision to answer, not from the send, so a burst of different commands is
  held back even while the queue is still working.
- `uses` is written to the settings on every answer (`host.updateSettings`), which saves `config.json`; the counts
  are kept in memory as well, so a save that did not land loses nothing while the app runs.
- The log is ordered by the decision (a cooldown is logged at once, an answer once it was sent).

## Open

- A second bot account (its own login) would need a second token in the shell: not in this version.
- Other prefixes than `!`, and variables beyond the four placeholders (`{touser}`, uptime, …).
- Mod-only management commands in the chat (`!addcom`): everything is managed in the app for now.
- The bot cannot tell whether the account is a mod in another channel (the higher rate limit): it always keeps the
  spacing for a plain user.
