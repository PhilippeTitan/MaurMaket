import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import { username, phoneNumber, emailOTP, twoFactor } from 'better-auth/plugins';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLogoDataUri() {
  try {
    const imagePath = path.resolve(__dirname, '../../assets/Logo/webp/Maurmaket Logo Text Trans Solo.webp');
    const fileBuffer = fs.readFileSync(imagePath);
    return `data:image/webp;base64,${fileBuffer.toString('base64')}`;
  } catch (error) {
    console.warn('[Auth:Logo] Could not load local MaurMaket logo asset, falling back to text branding.', error);
    return null;
  }
}

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

function buildEmailChangeEmailHtml(url) {
  const fallbackUrl = url || 'https://maurmaket.app';
  const logoDataUri = getLogoDataUri();

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
              ${logoDataUri ? `<img src="${logoDataUri}" alt="MaurMaket" style="display:block;max-width:220px;height:auto;margin:0 auto;" />` : `<h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">MaurMaket</h1>`}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px 40px;">

              <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">
                Confirm your email change
              </h2>

              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#52525b;">
                You requested to change the email address connected to your MaurMaket account. Confirm this email address to complete the change.
              </p>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:10px;background-color:#18181b;">
                    <a href="${fallbackUrl}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Confirm new email address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:32px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
                If you didn't request this change, secure your account immediately and contact MaurMaket Support.
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
  const fallbackUrl = url || 'https://maurmaket.app';
  const logoDataUri = getLogoDataUri();

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
              ${logoDataUri ? `<img src="${logoDataUri}" alt="MaurMaket" style="display:block;max-width:220px;height:auto;margin:0 auto;" />` : `<h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">MaurMaket</h1>`}
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
        sendOTP: async ({ email, otp }) => {
          console.log(`[Auth:EmailOTP] OTP for ${email}: ${otp}`);
          // TODO: Wire real email provider (Resend, SendGrid, etc.)
          // await emailProvider.send({ to: email, subject: 'Your MaurMaket code', body: `Code: ${otp}` });
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

    // Allow cross-origin requests from the Expo web dev server and production URL
    trustedOrigins: [
      'http://localhost:8081',
      'http://localhost:8080',
      'http://localhost:4000',
      'http://localhost:3001',
      'http://localhost:19006',
      'https://maurmaket.onrender.com',
    ],

    emailVerification: {
      expiresIn: 600,
      sendOnSignUp: true,
      sendOnSignIn: false,
      async sendVerificationEmail({ user, url }) {
        const html = buildEmailChangeEmailHtml(url);

        // TODO: replace this with the production mailer (Resend / SendGrid / SMTP)
        console.log(`[Auth:EmailVerification] Sending verification email to ${user.email}`);
        console.log(html);
      },
    },

    emailAndPassword: {
      enabled: true,
      autoVerifyEmail: true,
      minPasswordLength: 6,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: async ({ user, url }) => {
        const html = buildPasswordResetEmailHtml(url);

        console.log(`[Auth:PasswordReset] Sending reset email to ${user.email}`);
        console.log(html);
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
