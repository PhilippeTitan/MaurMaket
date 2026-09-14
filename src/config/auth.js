import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';

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
    ],

    emailAndPassword: {
      enabled: true,
      autoVerifyEmail: true,
      minPasswordLength: 6,
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
