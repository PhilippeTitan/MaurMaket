import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';
import { pool } from './database.js';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_BASE_URL || 'http://localhost:4000',
  secret: process.env.BETTER_AUTH_SECRET || 'maurmaket_better_auth_secret_2026',

  database: pool,

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
