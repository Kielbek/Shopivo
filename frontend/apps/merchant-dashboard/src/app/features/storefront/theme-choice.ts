import { ThemePreset, ThemeResponse, ThemeSection } from '@shopivo/shared-models';

/** Texts the merchant may have written; kept when switching templates (colours and layout come from the new one). */
const CONTENT_KEYS = ['announcement', 'footerNote', 'logoImage', 'instagram', 'facebook', 'tiktok', 'youtube'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(data: Record<string, any>, keys: string[], keep: (key: string, value: unknown) => boolean = () => true): Record<string, any> {
  return Object.fromEntries(keys.filter((k) => data[k] && keep(k, data[k])).map((k) => [k, data[k]]));
}

/**
 * Draft for switching to template `p`: the new template's settings and home page, plus only what the merchant wrote
 * themselves — values still equal to the previous template's defaults (its sample texts, its own photos) are replaced.
 */
export function themeChoice(d: ThemeResponse, p: ThemePreset): { settings: Record<string, string>; sections: ThemeSection[] } {
  const settings = { ...p.defaults };
  let sections = p.sections;
  if (d.state.version >= 0) {
    const old = d.presets.find((x) => x.code === d.state.draft.code);
    const oldHeroDefaults = old?.sections.find((s) => s.type === 'hero')?.data ?? {};
    for (const k of CONTENT_KEYS) {
      const v = d.state.draft.settings[k];
      if (v && v !== old?.defaults[k]) settings[k] = v;
    }
    const oldHero = d.state.draft.sections?.find((s) => s.type === 'hero');
    if (oldHero && old) {
      const own = pick(oldHero.data, ['heading', 'subheading', 'cta', 'link', 'image'],
        (k, v) => v !== oldHeroDefaults[k] && !(k === 'image' && String(v).startsWith('tpl:')));
      sections = p.sections.map((s) => (s.type === 'hero' ? { ...s, data: { ...s.data, ...own } } : s));
    }
  }
  return { settings, sections };
}

/** "1 sklep", "3 sklepy", "12 sklepów". */
export function storesLabel(n: number): string {
  const word = n === 1 ? 'sklep' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'sklepy' : 'sklepów';
  return `${n} ${word}`;
}
