export const locales = ['de', 'de-personal', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'de';

export const localeLabels: Record<Locale, string> = {
  de: 'Deutsch (Formell)',
  'de-personal': 'Deutsch (Persönlich)',
  en: 'English',
};
