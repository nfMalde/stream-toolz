// Small formatting helpers shared by the pages.

export function bytes(value: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = value;
  let unit = 0;
  while (n >= 1000 && unit < units.length - 1) {
    n /= 1000;
    unit++;
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: n < 10 && unit > 0 ? 1 : 0 })} ${units[unit]}`;
}

/** "piper:de_DE-ramona-low" → "Ramona", "kokoro:af_heart" → "Heart", "Microsoft Hedda Desktop" → "Hedda Desktop". */
/** Names whose spelling the id does not show. */
const SPELLED: Record<string, string> = { ljspeech: 'LJSpeech' };

export function voiceName(id: string): string {
  if (!id) return '';
  if (id.startsWith('piper:')) {
    const name = id.split('-')[1] ?? id;
    return SPELLED[name] ?? name.replace(/_k$/, ' K').replace(/^./, (c) => c.toUpperCase());
  }
  if (id.startsWith('vits:')) return (id.slice(5).split('-')[0] ?? id).toUpperCase();
  if (id.startsWith('kokoro:')) {
    const name = id.split('_')[1] ?? id;
    return name.replace(/^./, (c) => c.toUpperCase());
  }
  return id.replace(/^Microsoft\s+/, '');
}

/** "14:03:21" in the UI language. */
export function clock(epochMs: number, locale: string): string {
  return new Date(epochMs).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
