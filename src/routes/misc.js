import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import express from 'express';

const router = Router();

// ───── Map Crash Reports ─────
router.post('/api/debug/map-report', authRequired, express.json({ limit: '50kb' }), (req, res) => {
  const { logs, platform, appVersion, timestamp } = req.body;
  console.error(`\n=== MAP DEBUG REPORT [${timestamp || new Date().toISOString()}] platform=${platform} appVersion=${appVersion} ===`);
  if (Array.isArray(logs)) {
    logs.forEach((l) => console.error(`  ${l}`));
  } else {
    console.error('  raw:', JSON.stringify(logs).slice(0, 2000));
  }
  console.error('=== END MAP DEBUG REPORT ===\n');
  res.json({ ok: true });
});

// ───── Map Config (MapTiler key for client, requires auth) ─────
router.get('/api/map-config', authRequired, (_req, res) => {
  res.json({ maptilerKey: process.env.MAPTILER_KEY || null });
});

// ───── Legal Pages (Google OAuth requirement) ─────
const legalPage = (title, content) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - MaurMaket</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h1{font-size:1.8em;margin-bottom:.3em}h2{font-size:1.3em;margin-top:1.5em}p,li{font-size:.95em}a{color:#C0406A}ul{padding-left:1.5em}.meta{color:#666;font-size:.85em;margin-bottom:2em}</style></head><body><h1>${title}</h1><p class="meta">Effective: August 7, 2026 &middot; MaurMaket (maurmaket.onrender.com)</p>${content}<hr><p style="color:#999;font-size:.8em">Questions? Contact us at maurinexus.contact@gmail.com</p></body></html>`;

router.get('/privacy', (_req, res) => {
  res.type('html').send(legalPage('Privacy Policy', `
    <h2>Information We Collect</h2>
    <p>When you use MaurMaket, we collect information you provide directly: name, email, phone number, and profile photo. We also collect transaction data (listings, purchases, messages between buyers and sellers) and device information for app functionality.</p>
    <h2>How We Use Your Information</h2>
    <ul>
      <li>To provide, maintain, and improve MaurMaket services</li>
      <li>To process transactions and send related information</li>
      <li>To send technical notices, updates, and security alerts</li>
      <li>To respond to your comments and customer service requests</li>
      <li>To detect and prevent fraud or abuse</li>
    </ul>
    <h2>Information Sharing</h2>
    <p>We do not sell your personal information. We share data only with your consent, to comply with laws, or with service providers who assist in operating the platform (hosting, payment processing, analytics).</p>
    <h2>Data Security</h2>
    <p>We implement industry-standard security measures including encryption in transit (TLS) and at rest. However, no method of transmission over the Internet is 100% secure.</p>
    <h2>Data Retention</h2>
    <p>We retain your information as long as your account is active or as needed to provide services. You may request deletion of your account and data at any time.</p>
    <h2>Your Rights</h2>
    <p>You may access, update, or delete your personal information through your account settings or by contacting us at maurinexus.contact@gmail.com.</p>
    <h2>Changes</h2>
    <p>We may update this policy from time to time. Continued use of MaurMaket after changes constitutes acceptance of the revised policy.</p>
  `));
});

router.get('/terms', (_req, res) => {
  res.type('html').send(legalPage('Terms of Service', `
    <h2>Acceptance of Terms</h2>
    <p>By accessing or using MaurMaket, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>
    <h2>User Accounts</h2>
    <p>You must be at least 18 years old to use MaurMaket. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>
    <h2>Marketplace Rules</h2>
    <ul>
      <li>Listings must be accurate and not misleading</li>
      <li>You may not list prohibited items (weapons, drugs, counterfeit goods)</li>
      <li>Transactions must be completed through MaurMaket's payment system</li>
      <li>Meetups for exchanges must follow safety guidelines</li>
    </ul>
    <h2>Payments &amp; Fees</h2>
    <p>MaurMaket charges fees for completed transactions. Fees are displayed before you confirm a purchase. All payments are processed securely through MonCash.</p>
    <h2>Intellectual Property</h2>
    <p>All content on MaurMaket (logos, text, code) is owned by MaurMaket or its licensors. You may not copy, modify, or distribute any part of the service without written permission.</p>
    <h2>Limitation of Liability</h2>
    <p>MaurMaket is not liable for indirect, incidental, or consequential damages arising from your use of the service. Our total liability does not exceed the fees paid by you in the 12 months prior to the claim.</p>
    <h2>Termination</h2>
    <p>We may suspend or terminate your account at any time for violation of these terms. You may also delete your account at any time through your settings.</p>
    <h2>Governing Law</h2>
    <p>These terms are governed by the laws of Haiti. Disputes shall be resolved in the courts of Port-au-Prince, Haiti.</p>
    <h2>Changes</h2>
    <p>We reserve the right to modify these terms at any time. Material changes will be communicated via email or in-app notice.</p>
  `));
});

// 404 handler (must be last)
router.get('*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default router;
