import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import { bearer, username, phoneNumber, emailOTP, twoFactor } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import bcrypt from 'bcrypt';
import { verifyPassword as verifyBetterAuthPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { sendMail } from './mailer.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildBrandHeaderHtml() {
  // Text branding is reliable in email clients and keeps messages below Gmail's
  // clipping threshold (the old inline WebP logo added over 150 KB of base64).
  return '<h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">MaurMaket</h1>';
}

const EMAIL_OTP_COPY = {
  'sign-in': {
    subject: 'Your MaurMaket sign-in code',
    title: 'Your sign-in code',
    description: 'Enter this code in MaurMaket to sign in to your account.',
  },
  'email-verification': {
    subject: 'Verify your MaurMaket email',
    title: 'Verify your email',
    description: 'Enter this code in MaurMaket to verify your email address.',
  },
  'forget-password': {
    subject: 'Your MaurMaket password reset code',
    title: 'Reset your password',
    description: 'Enter this code in MaurMaket to continue resetting your password.',
  },
  'change-email': {
    subject: 'Confirm your MaurMaket email change',
    title: 'Confirm your email change',
    description: 'Enter this code in MaurMaket to confirm your new email address.',
  },
};

const DEFAULT_EMAIL_OTP_COPY = {
  subject: 'Your MaurMaket verification code',
  title: 'Your verification code',
  description: 'Enter this code in MaurMaket to continue.',
};

/**
 * Better Auth — lazy singleton.
 *
 * First call: createAuth(adapter) — pass a pg Pool or RAID adapter.
 * Subsequent: getAuth() — returns the existing instance.
 *
 * The DB Controller must call createAuth(raidAdapter) before the server starts listening.
 * studio.config.js can call getAuth() after the server has initialized.
 */

let _auth = null;

function buildEmailVerificationHtml(url) {
  const verificationUrl = escapeHtml(url || 'https://maurmaket.app');

  return `<!DOCTYPE html>

<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>

<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <tr>
            <td style="padding:32px 40px 20px;text-align:center;">
              ${buildBrandHeaderHtml()}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 40px;">

              <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">
                Verify your MaurMaket email
              </h2>

              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#52525b;">
                Confirm that this email address belongs to your MaurMaket account. Click the button below to verify your email.
              </p>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background-color:#18181b;">
                    <a href="${verificationUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Verify email address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:32px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
                This link expires in 10 minutes. If you didn't request this email, you can safely ignore it.
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;text-align:center;font-size:12px;color:#a1a1aa;">
                © Maurinex. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildPasswordResetEmailHtml(url) {
  const fallbackUrl = escapeHtml(url || 'https://maurmaket.app');

  return `<!DOCTYPE html>

<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>

<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;">

          <tr>
            <td style="padding:32px 40px 20px;text-align:center;">
              ${buildBrandHeaderHtml()}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 40px;">

              <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">
                Reset your password
              </h2>

              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#52525b;">
                We received a request to reset the password for your MaurMaket account.
              </p>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background-color:#18181b;">
                    <a href="${fallbackUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:32px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
                This link is intended only for you and will expire automatically. If you didn't request a password reset, you can safely ignore this email. Your current password will remain unchanged.
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;text-align:center;font-size:12px;color:#a1a1aa;">
                © Maurinex. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildEmailOtpHtml(otp, type) {
  const copy = EMAIL_OTP_COPY[type] || DEFAULT_EMAIL_OTP_COPY;
  const safeOtp = escapeHtml(otp);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 40px 20px;text-align:center;">${buildBrandHeaderHtml()}</td></tr>
        <tr><td style="padding:20px 40px 40px;">
          <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">${copy.title}</h2>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#52525b;">${copy.description}</p>
          <div style="padding:18px 16px;border-radius:10px;background-color:#f4f4f5;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;">${safeOtp}</div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a;">This code expires in 10 minutes. Never share it with anyone. If you didn't request it, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;text-align:center;font-size:12px;color:#a1a1aa;">© Maurinex. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Initialize Better Auth with a database adapter (RAID adapter from DB Controller,
 * or a raw pg Pool for dev/studio fallback).
 * Can only be called once — second call returns existing instance.
 */
export function createAuth(adapter) {
  if (_auth) return _auth;

  _auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_BASE_URL || 'http://localhost:4000',
    secret: process.env.BETTER_AUTH_SECRET || 'maurmaket_better_auth_secret_2026',

    // Better Auth expects a factory function (adapter-base.mjs line 14):
    //   typeof database === "function" → database(options) returns the adapter
    // If it's an object, Better Auth tries Kysely on it → fails
    database: (opts) => adapter,

    plugins: [
      dash(),
      bearer(),
      passkey({ rpName: 'MaurMaket' }),

      // Username — @publicname for marketplace identity
      username(),

      // Phone Number — +509 OTP for marketplace trust
      phoneNumber({
        sendOTP: async ({ phoneNumber, code }) => {
          console.log(`[Auth:SMS] OTP for ${phoneNumber}: ${code}`);
          // TODO: Wire real SMS provider (Twilio, Twilio Verify, etc.)
          // await smsProvider.send({ to: phoneNumber, body: `Your MaurMaket code: ${code}` });
        },
      }),

      // Email OTP — passwordless login + verification + password reset
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          const copy = EMAIL_OTP_COPY[type] || DEFAULT_EMAIL_OTP_COPY;
          await sendMail({
            to: email,
            subject: copy.subject,
            html: buildEmailOtpHtml(otp, type),
            text: `Your MaurMaket code is ${otp}. It expires in 10 minutes. Never share this code with anyone.`,
          });
        },
        expiresIn: 600, // 10 minutes
        maxAttempts: 5,
      }),

      // Two-Factor — TOTP for seller/admin accounts
      twoFactor({
        issuer: 'MaurMaket',
        // Don't force 2FA on everyone — let sellers/admins opt in
        requireTwoFactor: false,
      }),
    ],

    // Allow cross-origin requests from Expo dev server, LAN IPs, and production
    // Function form: receives request, returns array of allowed origin strings
    trustedOrigins: async (request) => {
      const base = [
        'https://maurmaket.onrender.com',
        'maurmaket://', // mobile app deep link callback
      ];
      // Dynamic dev origins: any port on localhost/127.0.0.1/::1 or private LAN IPs.
      // Metro can land on any port (8081, 8082, ...), so never hardcode ports here.
      const headers = request?.headers;
      const get = (name) => (headers?.get ? headers.get(name) : headers?.[name]);
      const origin = get('origin');
      if (origin && /^http:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|\[::1\](:\d+)?|192\.168\.\d+\.\d+(:\d+)?|10\.\d+\.\d+\.\d+(:\d+)?|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?)$/.test(origin)) {
        base.push(origin);
      }
      // Derive origin from request Host header (covers LAN IPs that change)
      const host = get('host');
      if (host) {
        base.push(`http://${host}`, `https://${host}`);
      }
      return base;
    },

    emailVerification: {
      expiresIn: 600,
      sendOnSignUp: true,
      sendOnSignIn: false,
      async sendVerificationEmail({ user, url }) {
        const html = buildEmailVerificationHtml(url);
        await sendMail({
          to: user.email,
          subject: 'Verify your MaurMaket email',
          html,
          text: `Verify your email: ${url}`,
        });
      },
    },

    emailAndPassword: {
      enabled: true,
      autoVerifyEmail: true,
      minPasswordLength: 6,
      resetPasswordTokenExpiresIn: 3600,
      // Password resets happen precisely when an account may be compromised —
      // kill every existing session so an attacker holding one is signed out.
      revokeSessionsOnPasswordReset: true,
      // Legacy MaurMaket passwords are bcrypt hashes in users.password_hash.
      // Better Auth continues to create new scrypt hashes; this verifier accepts
      // both formats while legacy accounts are bridged into accounts.password.
      password: {
        verify: async ({ hash, password }) => /^\$2[aby]\$/.test(hash)
          ? bcrypt.compare(password, hash)
          : verifyBetterAuthPassword({ hash, password }),
      },
      sendResetPassword: async ({ user, url }) => {
        const html = buildPasswordResetEmailHtml(url);
        await sendMail({
          to: user.email,
          subject: 'Reset your MaurMaket password',
          html,
          text: `Reset your password: ${url}`,
        });
      },
    },

    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
    },

    user: {
      modelName: 'users',
      fields: {
        id: 'id',
        name: 'full_name',
        email: 'email',
        emailVerified: 'email_verified',
        image: 'avatar_url',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'buyer',
          input: false,
        },
        // Username plugin fields
        username: {
          type: 'string',
          required: false,
          unique: true,
          input: true,
        },
        displayUsername: {
          type: 'string',
          required: false,
          input: true,
        },
        // Phone Number plugin fields
        phoneNumber: {
          type: 'string',
          required: false,
          unique: true,
          input: true,
        },
        phoneNumberVerified: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
        // Store DOB in the same Better Auth user insert as the account so an
        // app-profile bootstrap failure cannot silently lose this KYC field.
        dateOfBirth: {
          type: 'string',
          fieldName: 'date_of_birth',
          required: false,
          input: true,
          validator: {
            input: z.string()
              .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date of birth')
              .refine((value) => {
                const date = new Date(`${value}T00:00:00.000Z`);
                return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
              }, 'Enter a valid date of birth')
              .refine((value) => {
                const dob = new Date(`${value}T00:00:00.000Z`);
                const today = new Date();
                let age = today.getUTCFullYear() - dob.getUTCFullYear();
                const monthDiff = today.getUTCMonth() - dob.getUTCMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < dob.getUTCDate())) age--;
                return age >= 18;
              }, 'You must be at least 18 years old'),
          },
        },
        // Two-Factor plugin fields
        twoFactorEnabled: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },

    session: {
      modelName: 'sessions',
      fields: {
        id: 'id',
        userId: 'user_id',
        token: 'token',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        loginMethod: 'login_method',
      },
    },

    // Batch 73 / APP-Q369 — every new session (any sign-in path: password,
    // OTP, Google, passkey) is recorded in the account's private security
    // activity history and alerts the owner through the always-immediate
    // security notification path. Loaded dynamically and fully guarded so a
    // failure here can never break authentication itself.
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              const userId = session?.userId;
              if (!userId) return;
              const userAgent = typeof session?.userAgent === 'string' ? session.userAgent : '';
              const { recordSecurityEvent } = await import('../utils/securityEvents.js');
              await recordSecurityEvent(userId, 'sign_in', { userAgent });
              const { createNotification } = await import('../utils/notifications.js');
              await createNotification(
                userId,
                'new_sign_in',
                'New sign-in to your account',
                'A new device just signed in. If this was not you, secure your account now.',
                { screen: 'SecuritySettings' }
              );
            } catch (err) {
              console.error('[auth] Sign-in security hook failed:', err?.message || err);
            }
          },
        },
      },
    },

    account: {
      modelName: 'accounts',
      fields: {
        id: 'id',
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        scope: 'scope',
        password: 'password',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },

    verification: {
      modelName: 'verifications',
      fields: {
        id: 'id',
        identifier: 'identifier',
        value: 'value',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },

    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
        validateSchema: false,
      },
    },
  });

  return _auth;
}

/**
 * Get the existing Better Auth instance.
 * Throws if createAuth() hasn't been called yet.
 */
export function getAuth() {
  if (!_auth) {
    throw new Error('[auth] Not initialized — call createAuth(adapter) before starting the server');
  }
  return _auth;
}
