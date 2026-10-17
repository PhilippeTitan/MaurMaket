import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const locales = ['en', 'fr', 'ht'] as const;

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8'));
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, full);
    }
    return [full];
  });
}

function leafStrings(obj: Record<string, unknown>, prefix = ''): [string, string][] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return leafStrings(value as Record<string, unknown>, full);
    }
    return [[full, String(value)]] as [string, string][];
  });
}

describe('i18n locale parity', () => {
  const en = load('en');
  const enKeys = flattenKeys(en).sort();

  it('en has a non-trivial number of keys', () => {
    expect(enKeys.length).toBeGreaterThan(500);
  });

  for (const locale of locales.slice(1)) {
    describe(locale, () => {
      const localized = load(locale);
      const localKeys = flattenKeys(localized).sort();

      it('has exactly the same key set as en', () => {
        const missing = enKeys.filter((k) => !localKeys.includes(k));
        const extra = localKeys.filter((k) => !enKeys.includes(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it('has no empty translation values', () => {
        const empty = leafStrings(localized)
          .filter(([, value]) => value.trim() === '')
          .map(([key]) => key);
        expect(empty).toEqual([]);
      });
    });
  }
});
