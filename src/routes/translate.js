import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// On-demand translation for user-written content (reviews v1 — Profile &
// Settings handoff): translations are optional, keep the original text, and are
// clearly labelled as translations.
//
// MaurMaket has no translation provider configured yet, so this endpoint says so
// plainly instead of returning invented text. Wire a provider by setting
// TRANSLATION_API_URL and TRANSLATION_API_KEY; the contract below stays the same.
const SUPPORTED_LANGS = new Set(['en', 'fr', 'ht']);
const MAX_TEXT_LENGTH = 2000;

function translationProviderConfigured() {
  return Boolean(process.env.TRANSLATION_API_URL && process.env.TRANSLATION_API_KEY);
}

// Lets the client hide the translate affordance entirely while no provider is
// connected, instead of showing a button that would always fail.
router.get('/api/translate/status', (req, res) => {
  res.json({
    available: translationProviderConfigured(),
    target_languages: [...SUPPORTED_LANGS],
  });
});

router.post('/api/translate', optionalAuth, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const targetLang = String(req.body?.targetLang || '').toLowerCase();
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `text must be ${MAX_TEXT_LENGTH} characters or less` });
  }
  if (!SUPPORTED_LANGS.has(targetLang)) {
    return res.status(400).json({ error: 'Unsupported target language' });
  }

  if (!translationProviderConfigured()) {
    return res.status(501).json({
      error: 'Translation is not available yet',
      code: 'TRANSLATION_NOT_CONFIGURED',
    });
  }

  try {
    const response = await fetch(process.env.TRANSLATION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TRANSLATION_API_KEY}`,
      },
      body: JSON.stringify({ text, target_lang: targetLang, preserve_formatting: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return res.status(502).json({ error: 'Translation provider error', code: 'TRANSLATION_PROVIDER_ERROR' });
    }
    const data = await response.json();
    const translated = data?.translated_text || data?.translations?.[0]?.text || null;
    if (!translated) {
      return res.status(502).json({ error: 'Translation provider returned no text', code: 'TRANSLATION_PROVIDER_ERROR' });
    }
    res.json({ translated_text: translated, target_lang: targetLang });
  } catch (err) {
    console.error('Translation error:', err?.message || err);
    res.status(502).json({ error: 'Translation failed', code: 'TRANSLATION_PROVIDER_ERROR' });
  }
});

export default router;
