/**
 * Two languages for the patient side of the app: English and Marathi.
 * Staff pages stay in English. Every patient-facing sentence is written as
 * tr('English', 'मराठी') right where it is used, so both versions sit side by
 * side and a Marathi reader can check them easily (see MARATHI-REVIEW.md).
 */
export type Lang = 'en' | 'mr';

let active: Lang = 'en';

/** Set by the language switch; the pages are then drawn again in that language. */
export function setActiveLang(lang: Lang) {
  active = lang;
}

export function currentLang(): Lang {
  return active;
}

/** The sentence in the language currently chosen. */
export function tr(en: string, mr: string): string {
  return active === 'mr' ? mr : en;
}
