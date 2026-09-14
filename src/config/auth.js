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

  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
});
