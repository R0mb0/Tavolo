// Tiny i18n layer: flat JSON dictionaries in /locales, English as fallback.
export const LANGS = {
  en: 'English', it: 'Italiano', es: 'Español', fr: 'Français', de: 'Deutsch',
  pt: 'Português', zh: '中文', ja: '日本語', ko: '한국어'
};

let dict = {}, fallback = null, lang = 'en';

const get = l => fetch(`locales/${l}.json`).then(r => r.json());

export function detect() {
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const k = l.toLowerCase().split('-')[0];
    if (LANGS[k]) return k;
  }
  return 'en';
}

export async function setLang(pref) {
  lang = pref === 'auto' || !LANGS[pref] ? detect() : pref;
  if (!fallback) fallback = await get('en');
  dict = lang === 'en' ? fallback : await get(lang).catch(() => ({}));
  document.documentElement.lang = lang;
}

export const getLang = () => lang;

export function t(key, vars) {
  let s = dict[key] ?? fallback?.[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

/** Localised field of a game definition (name, tagline, rules). */
export const gt = (def, key) => def.i18n[lang]?.[key] ?? def.i18n.en[key];
