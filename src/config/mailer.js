import nodemailer from 'nodemailer';

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

const SEND_TIMEOUT_MS = 12000;

export async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    // Never write message bodies to logs: they can contain verification links,
    // password reset tokens, or one-time codes.
    console.warn(`[Mailer] SMTP not configured — not sending "${subject}"`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  let timer;
  try {
    const send = transporter.sendMail({
      from: `"MaurMaket" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    const info = await Promise.race([
      send,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('smtp_send_timeout')), SEND_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
    console.log(`[Mailer] Sent "${subject}" (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Failed to send "${subject}":`, err.message);
    return { sent: false, reason: err.message };
  } finally {
    clearTimeout(timer);
  }
}
