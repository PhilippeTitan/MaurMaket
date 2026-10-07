/**
 * Baseline policy documents for the policy transparency & consent work
 * (app-wide ledger Batch 72, APP-Q356–APP-Q365).
 *
 * The full legal text lives on the public website. The app stores only the
 * current version identifier plus a short, localized "what changed" summary and
 * a link, which is what the ledger requires the app to surface. New versions are
 * added by inserting a row into `policy_versions`; acceptance is always recorded
 * against the exact version the user reviewed.
 */

export const POLICY_KINDS = ['terms', 'privacy'];
export const SUPPORTED_POLICY_LOCALES = ['en', 'fr', 'ht'];
export const DEFAULT_POLICY_LOCALE = 'en';

/** Normalize a locale such as 'fr-HT' to a supported policy locale. */
export function resolvePolicyLocale(value) {
  const locale = String(value || '').toLowerCase();
  if (SUPPORTED_POLICY_LOCALES.includes(locale)) return locale;
  const primary = locale.split('-')[0];
  return SUPPORTED_POLICY_LOCALES.includes(primary) ? primary : DEFAULT_POLICY_LOCALE;
}

/** Policy documents MaurMaket ships with. Seeded once per kind. */
export const BASELINE_POLICY_VERSIONS = [
  {
    kind: 'terms',
    version: '1.0',
    isMaterial: true,
    summaries: {
      en: {
        title: 'MaurMaket Terms of Service',
        summary: 'The rules for buying, selling, and meeting on MaurMaket, including your responsibilities and how disagreements are handled.',
        url: 'https://maurmaket.com/terms',
      },
      fr: {
        title: "Conditions d'utilisation de MaurMaket",
        summary: "Les règles pour acheter, vendre et se rencontrer sur MaurMaket, y compris vos responsabilités et la gestion des désaccords.",
        url: 'https://maurmaket.com/terms',
      },
      ht: {
        title: 'Kondisyon Sèvis MaurMaket',
        summary: 'Règle pou achte, vann, ak rankontre sou MaurMaket, ansanm ak responsablite w ak jan nou jere dezakò.',
        url: 'https://maurmaket.com/terms',
      },
    },
  },
  {
    kind: 'privacy',
    version: '1.0',
    isMaterial: true,
    summaries: {
      en: {
        title: 'MaurMaket Privacy Notice',
        summary: 'What personal data MaurMaket collects, why we need it, who we share it with, and the controls you have.',
        url: 'https://maurmaket.com/privacy',
      },
      fr: {
        title: 'Avis de confidentialité de MaurMaket',
        summary: 'Les données personnelles que MaurMaket collecte, pourquoi nous en avons besoin, avec qui nous les partageons et les contrôles dont vous disposez.',
        url: 'https://maurmaket.com/privacy',
      },
      ht: {
        title: 'Avi Konfidansyalite MaurMaket',
        summary: 'Ki done pèsonèl MaurMaket kolekte, poukisa nou bezwen yo, ak kiyès nou pataje yo, ak kontwòl ou genyen.',
        url: 'https://maurmaket.com/privacy',
      },
    },
  },
];
