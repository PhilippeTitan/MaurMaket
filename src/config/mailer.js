import nodemailer from 'nodemailer';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Mailer] SMTP not configured — emails will be logged only');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user, pass },
  });

  return _transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[Mailer] SMTP not configured — would send to ${to}: ${subject}`);
    console.log(html);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"MaurMaket" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      text,
    });
    console.log(`[Mailer] Sent "${subject}" to ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Failed to send "${subject}" to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}
