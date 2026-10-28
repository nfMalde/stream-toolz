// Is a chat message German or English? A small, dependency-free guess from common function words, German
// letters (ä ö ü ß) and English contractions. Short or mixed messages ("gg", "lol", "nice") stay undecided:
// the chat's main language reads them. Tested in test/language.test.ts.

export type ChatLanguage = 'de' | 'en';
export const CHAT_LANGUAGES: readonly ChatLanguage[] = ['de', 'en'];

/** The locale a language's voices and words use. */
export function localeOf(language: ChatLanguage): string {
  return language === 'de' ? 'de-DE' : 'en-US';
}

export function languageOf(locale: string): ChatLanguage {
  return locale.toLowerCase().startsWith('de') ? 'de' : 'en';
}

// Words that exist in both languages ("die", "was", "so", "also", "will", "bin", "war", "hat", "man", "in", "fast",
// "kind", "nice", "hey", "bro", "stream", "chat", "ok", "okay", "cool", "super", "sorry", "see", "bad") are
// deliberately in neither list. Short chat praise is listed where only one language uses it ("great" vs. "toll"):
// "ok great" was read as German on 2026-10-23.
const GERMAN = new Set(
  (
    'ich du er wir ihr mich mir dich dir uns euch und oder aber nicht kein keine keinen ist sind bist hab habe hast haben ' +
    'hatte wird werden wurde kann kannst muss musst soll sollte darf mag gibt geht gehts macht mach mache machen sag sagt ' +
    'schon noch auch nur mal jetzt heute morgen gestern immer nie wieder sehr mehr viel gleich bitte danke hallo moin ' +
    'servus nein nee ja doch genau richtig echt krass geil alter digga leute der das den dem des ein eine einen einem ' +
    'einer mit auf zum zur bei nach vor aus wie warum wieso wer wo wann welche dass weil wenn dann als hier da dort ' +
    'gerade grad eigentlich vielleicht wirklich ganz schon sowas bisschen gut klar oki jo ' +
    'toll prima klasse lecker schade wunderbar wahnsinn endlich stimmt passt willkommen gute guten abend nacht tschau ' +
    'spiel spielen spielt ach achso naja halt eben wohl gern gerne herzlich gratuliere nabend'
  ).split(' '),
);

const ENGLISH = new Set(
  (
    'the and or but not is are am were be been being have has had do does did done can could would should shall may ' +
    'might must i you he she we they me him her us them my your his our their it its this that these those what why ' +
    'how who where when which there here just now today tomorrow yesterday always never again very more much many ' +
    'please thanks thank hello yes yeah yep nope no of to for from with on at by about into over under after before if ' +
    'then than because too only really maybe good guys game play playing dude love lets gonna wanna got get go going ' +
    'come look know think want need like make made take say said tell everyone anyone someone something nothing ' +
    'great awesome amazing beautiful cute best better well sure right welcome back sounds looks happy enjoy played ' +
    'win won wait friend friends everybody everything all morning evening night day time new first last next thx'
  ).split(' '),
);

const GERMAN_LETTERS = /[äöüß]/i;
/** don't, it's, i'm, you're, that's, can't, i've, we'll … */
const CONTRACTION = /^[a-z]+'(t|s|m|re|ve|ll|d)$/i;

/** 'de', 'en', or undefined when the message gives no clear hint. */
export function detectLanguage(text: string): ChatLanguage | undefined {
  let german = 0;
  let english = 0;
  for (const raw of text.toLowerCase().replace(/[’`]/g, "'").split(/[^\p{L}']+/u)) {
    const word = raw.replace(/^'+|'+$/g, '');
    if (!word) continue;
    if (CONTRACTION.test(word)) english += 2;
    else if (ENGLISH.has(word)) english++;
    if (GERMAN.has(word)) german++;
    if (GERMAN_LETTERS.test(word)) german++;
  }
  if (german > english) return 'de';
  if (english > german) return 'en';
  return undefined;
}
