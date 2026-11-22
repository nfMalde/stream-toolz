# ReadMyChat – Language packs

Status: binding · As of: 2026-10-30

ReadMyChat reads each chat message in its own language, with a voice for that language and that language's words
around the message ("Maldö sagt: …", "Maldö says: …"). Until 2026-10-30 the module knew German and English in code
("das Modul spricht nur deutsch … GT Toolz kann mehr", the user). Now every language is a **language pack**: a JSON
file with the words that give the language away and the few texts the app itself speaks. The model is GT Toolz's
`docs/04-language-packs.md`; the format is simpler because ReadMyChat speaks far less of its own.

A new language is one file plus a voice the user has. Nothing else changes: the voice picker, the main language
select and the detection follow the loaded packs.

## Where are the packs?

| Location | Content |
|---|---|
| `modules/readmychat/language-packs/de.json`, `en.json` | built in (loaded through a JSON import, like the voice catalogue) |
| `%APPDATA%\Stream Toolz[-dev]\modules\readmychat\language-packs\*.json` | the user's own packs; a pack with the `id` of a built-in one replaces it |

The Voice page has a "Language packs" card: the loaded packs (built in / own), "Open folder" and "Reload". The folder
is read at start and on "Reload"; the folder is created when missing. Invalid files are skipped and logged as
`READMYCHAT language pack <file>.json: <why>` (only the file name, never the folder path); the other packs still
load. The log also lists what loaded: `READMYCHAT language packs: de (built in), en (built in), fr (own)`.

## Format

```json
{
  "format": "stream-toolz-language-pack",
  "version": 1,
  "id": "fr",
  "name": "Français",
  "locale": "fr-FR",
  "letters": "éèêàçùœ",
  "words": ["bonjour", "merci", "oui", "non", "je", "tu", "nous", "vous", "est", "sont", "pas", "très", "bien", "salut"],
  "pronounce": { "gg": "bien joué" },
  "texts": {
    "says": "{name} dit : {message}",
    "link": "lien",
    "testName": "Read My Chat",
    "outputTest": "Bonjour ! Voilà comment le chat sonne sur cette sortie.",
    "preview": "Bonjour le chat ! Voilà ma voix quand je lis vos messages.",
    "anonymous": "Quelqu’un",
    "prime": "Prime",
    "tier": "Niveau {n}",
    "events": {
      "follow": "{name} suit maintenant la chaîne. Bienvenue !",
      "sub": "{name} s’est abonné à la chaîne. Merci !",
      "prime": "{name} s’est abonné avec Prime. Merci !",
      "resub": "{name} est abonné depuis {months} mois. Merci !",
      "gift": "{name} offre un abonnement à {recipient}. Merci !",
      "communityGift": "{name} offre {count} abonnements à la communauté. Merci !",
      "raid": "{name} arrive en raid avec {count} spectateurs. Bienvenue !"
    },
    "eventsOne": {
      "communityGift": "{name} offre un abonnement à la communauté. Merci !",
      "raid": "{name} arrive en raid avec un spectateur. Bienvenue !"
    }
  }
}
```

| Field | What |
|---|---|
| `format`, `version` | always `"stream-toolz-language-pack"` and `1` |
| `id` | the language code, lower case: `de`, `en`, `fr`, `pt-br` (`/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/`). It is the key of the voice setting and what the Live page shows next to a message. |
| `name` | display name in the language itself ("Deutsch"), at most 60 characters |
| `locale` | BCP 47 ("de-DE", "pt-BR"): the voice is chosen by it, and the main language select stores it |
| `words` | lower-case words typical of the language (function words, greetings, chat praise), at most 2000, letters and apostrophes only. See "How detection works". |
| `letters` | optional: letters typical of the language ("äöüß"); a word containing one counts like a listed word |
| `pronounce` | optional: word (any case) → how the voice says it, whole words only; at most 200 entries. The streamer's own pronunciations (Settings) win over these. |
| `texts` | all the texts below, every one required |

### Texts and their placeholders

| Key | Spoken when | Placeholders |
|---|---|---|
| `says` | around a message when the name is said | `{name}`, `{message}` |
| `link` | instead of a link in a message | – |
| `testName` | the name of the app's own test messages | – |
| `outputTest` | "Play test" on the Output page | – |
| `preview` | "Listen" next to a voice | – |
| `anonymous` | the `{name}` of an anonymous gift | – |
| `prime` | the `{tier}` of a Prime sub | – |
| `tier` | the `{tier}` of a paid sub | `{n}` (1, 2, 3) |
| `events.follow`, `.sub`, `.prime`, `.resub`, `.gift`, `.communityGift`, `.raid` | channel events, in the chat's main language | `{name}`, `{count}`, `{months}`, `{recipient}`, `{tier}` |
| `eventsOne.<kind>` | optional: the same with a count of one, where the words change ("ein Abo", "a sub") | the same |

Texts are spoken, so write everything out (no abbreviations), and place commas and periods where the voice should
pause (the pauses are set on the Voice page). Keep them short: the chat is waiting.

### Validation rules

A pack is either complete and valid, or it is skipped with a reason (decided 2026-10-30: a half-usable pack would
read half the chat in the wrong words). Rejected is a file that

- is not a JSON object, has another `format` or `version`, or an `id` that is not a lower-case language code;
- has no `name`, or a `locale` that is not BCP 47-ish (`/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/`);
- has `words` that are not an array of at most 2000 lower-case words (letters, marks and apostrophes, at most 40 characters);
- has `letters` with anything but letters;
- misses one of the texts, has a text that is not a string, is empty, is longer than 500 characters or contains
  control characters, uses a placeholder the key does not have, or has a text key the format does not know
  (`eventsOne` may name only the seven events);
- has a `pronounce` entry whose word is not one word (letters, digits, apostrophe, hyphen) or whose spelling is
  empty or longer than 60 characters, or more than 200 entries;
- is larger than 1 MB.

The checks are pure (`modules/readmychat/src/language-pack.ts`, `validateLanguagePack()`), the file reading is in
`main/language-packs.ts`; both are tested in `test/language-pack.test.ts`. The built-in packs go through the same
check at start: a broken built-in file fails the module instead of the chat.

## How detection works

`src/language.ts`, `detectLanguage(text, packs)`. For every word of a message (mentions and emotes left out, so
"hello Maldö" stays English):

- a word listed in exactly one pack gives that pack a point; a word listed in more than one loaded pack counts for
  none (built in: "die", "was", "so", "nice", "stream" are in neither list for that reason);
- a word containing one of a pack's `letters` gives that pack a point;
- an English contraction (`don't`, `it's`, `we'll`) gives the English pack two points;
- a word in a script that names its language gives the first loaded pack of that language a point: Cyrillic →
  ru/uk/bg/sr/be/mk/kk, Greek → el, Hiragana/Katakana → ja, Hangul → ko, Han → zh (else ja), Arabic → ar/fa/ur,
  Hebrew → he, Thai → th, Devanagari → hi/mr/ne, Georgian → ka, Armenian → hy. Without a pack for the script the
  text stays undecided.

The pack with the most points reads the message; a tie or no points means undecided, and the chat's main language
reads it ("gg", "lol", "KEKW"). With "Detect the language of each message" off, everything is read in the main
language. The index of all words is built once per load of the packs.

The main language (Voice page) is the pack whose `locale` matches the setting (`de-DE`; `de-AT` finds `de` too);
without a pack for it, English reads, else the first loaded pack.

## A language needs a voice

Each language has its own voice setting (the Voice page shows one picker per loaded pack, the main language first,
the others only while detection is on). "Automatic" picks the best installed voice for the pack's `locale`
(`packages/speech/src/voices.ts`, `defaultVoiceId()`): an installed Piper voice first, then a Windows voice for the
language. Without any voice for a language, the main language's voice reads it.

- **Windows voices** work right away: install the language's voice in Windows (Settings → Time & language → Speech)
  and it appears in the picker after a restart of the app.
- **Piper voices** come only from the catalogue (`packages/speech/voice-packages.json`) after the user has checked
  the license of the voice and its training data (`docs/03-security.md`). No new voices were added on 2026-10-30;
  the German and English Piper voices stay as they are.

## Settings

- `voices`: voice id per pack id (`{ "de": "", "en": "piper:en_GB-cori-high", "fr": "Microsoft Hortense" }`). Keys
  of packs that are not loaded right now stay: a pack file may come back. At most 50 entries.
- `speechLanguage`: the main language as a locale ("de-DE"); any BCP 47-ish tag is accepted, which pack reads is
  decided when reading. On first start the system's language if a pack covers it, else `en-US`.
- `eventTexts`: the streamer's own event texts stay per event kind and are used for the main language, as before.

## Bridge

`window.stz.readmychat`: `languagePacks()` → `{ id, name, locale, builtIn, texts }[]`, `onLanguagePacks()` (sent after
a reload), `reloadLanguagePacks()`, `openLanguagePacksFolder()`. The UI uses the texts for the grey default texts on
the Events page.

## What leaves the PC

Nothing. Packs are read from the local folder only; no pack is ever downloaded or uploaded.

## Open

- A pack cannot bring a voice. Piper voices stay a catalogue matter (license check by the user).
- The shell's UI language stays German and English; a pack only adds a chat language.
- The word lists are a guess, not a dictionary: a pack author tunes them by watching the Live page (the language
  badge next to each message shows what was detected).
