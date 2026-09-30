import https from 'https';
import nodemailer from 'nodemailer';

// ───── Gmail API (primary) ─────
// Render free tier blocks outbound SMTP (smtp.gmail.com:587 connect times out),
// so production email goes through the Gmail API over HTTPS instead.
// Zero extra dependencies — native https module (see commit ead4d1a history).
const gmailClientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
const gmailSender = process.env.SMTP_USER || 'maurinexus.contact@gmail.com';
const gmailConfigured = Boolean(gmailClientId && gmailClientSecret && gmailRefreshToken);

const SEND_TIMEOUT_MS = 12000;
const HTTPS_TIMEOUT_MS = 10000;

function httpsJson({ hostname, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(body);
    const req = https.request(
      {
        hostname,
        path,
        method,
        headers: {
          ...headers,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => { buf += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: buf }));
      }
    );
    req.setTimeout(HTTPS_TIMEOUT_MS, () => req.destroy(new Error('https_timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getGmailAccessToken() {
  const postData = new URLSearchParams({
    client_id: gmailClientId,
    client_secret: gmailClientSecret,
    refresh_token: gmailRefreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const res = await httpsJson({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData,
  });

  let parsed;
  try { parsed = JSON.parse(res.body); } catch { parsed = null; }
  if (!parsed?.access_token) {
    throw new Error(`OAuth token exchange failed (${res.status})`);
  }
  return parsed.access_token;
}

function encodeHeaderValue(value) {
  // Non-ASCII subjects (FR/HT) must be MIME-encoded or Gmail rejects the raw message.
  return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=` : value;
}

async function sendViaGmailApi({ to, subject, html, text }) {
  const accessToken = await getGmailAccessToken();

  const lines = [
    `To: ${to}`,
    `From: "MaurMaket" <${gmailSender}>`,
    `Subject: ${encodeHeaderValue(subject)}`,
  ];
  if (html) {
    lines.push('Content-Type: text/html; charset=utf-8', '', html);
  } else {
    lines.push('Content-Type: text/plain; charset=utf-8', '', text || '');
  }

  const encodedMessage = Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await httpsJson({
    hostname: 'gmail.googleapis.com',
    path: '/gmail/v1/users/me/messages/send',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Gmail API ${res.status}`);
  }
  return { id: JSON.parse(res.body)?.id };
}

// ───── SMTP fallback (local dev — outbound SMTP is blocked on Render) ─────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Mailer] SMTP not configured — email delivery is disabled');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });

  return _transporter;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function sendMail({ to, subject, html, text }) {
  if (gmailConfigured) {
    try {
      const info = await withTimeout(sendViaGmailApi({ to, subject, html, text }), SEND_TIMEOUT_MS, 'gmail_api');
      console.log(`[Mailer] Sent "${subject}" via Gmail API (${info.id})`);
      return { sent: true, via: 'gmail-api', messageId: info.id };
    } catch (err) {
      console.error(`[Mailer] Gmail API failed for "${subject}":`, err.message);
      // fall through to SMTP
    }
  }

  const transporter = getTransporter();

  if (!transporter) {
    // Never write message bodies to logs: they can contain verification links,
    // password reset tokens, or one-time codes.
    console.warn(`[Mailer] SMTP not configured — not sending "${subject}"`);
    return { sent: false, reason: gmailConfigured ? 'gmail_api_failed' : 'smtp_not_configured' };
  }

  try {
    const info = await withTimeout(
      transporter.sendMail({
        from: `"MaurMaket" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text,
      }),
      SEND_TIMEOUT_MS,
      'smtp'
    );
    console.log(`[Mailer] Sent "${subject}" (${info.messageId})`);
    return { sent: true, via: 'smtp', messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Failed to send "${subject}":`, err.message);
    return { sent: false, reason: err.message };
  }
}
