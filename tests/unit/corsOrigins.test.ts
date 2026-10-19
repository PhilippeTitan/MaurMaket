import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../../src/config/cors.js';

// Regression guard for the 2026-10-19 Vercel cutover: the API answered 500 to
// every browser request carrying `Origin: https://maurmaket.vercel.app`,
// because the allowlist still only knew the Render host. A native app does not
// send Origin, so mobile kept working and hid the defect.
describe('isAllowedOrigin', () => {
  const noEnv = {} as NodeJS.ProcessEnv;

  it('allows the Vercel primary host', () => {
    expect(isAllowedOrigin('https://maurmaket.vercel.app', noEnv)).toBe(true);
  });

  it('keeps the Render secondary host working', () => {
    expect(isAllowedOrigin('https://maurmaket.onrender.com', noEnv)).toBe(true);
  });

  it('allows this project\'s Vercel branch and deployment aliases', () => {
    expect(isAllowedOrigin('https://maurmaket-git-main-maurinexuscontact-4757.vercel.app', noEnv)).toBe(true);
    expect(isAllowedOrigin('https://maurmaket-j9vopwrey-maurinexuscontact-4757.vercel.app', noEnv)).toBe(true);
  });

  it('rejects a squatted maurmaket-* project in someone else\'s Vercel account', () => {
    expect(isAllowedOrigin('https://maurmaket-evil.vercel.app', noEnv)).toBe(false);
    expect(isAllowedOrigin('https://maurmaket-git-main-attacker.vercel.app', noEnv)).toBe(false);
  });

  it('rejects unrelated hosts', () => {
    expect(isAllowedOrigin('https://evil.example.com', noEnv)).toBe(false);
    expect(isAllowedOrigin('https://maurmaket.vercel.app.evil.example', noEnv)).toBe(false);
  });

  it('allows missing Origin (native app, curl)', () => {
    expect(isAllowedOrigin(undefined, noEnv)).toBe(true);
    expect(isAllowedOrigin('', noEnv)).toBe(true);
  });

  it('allows loopback and LAN dev origins', () => {
    expect(isAllowedOrigin('http://localhost:8082', noEnv)).toBe(true);
    expect(isAllowedOrigin('http://192.168.1.42:8081', noEnv)).toBe(true);
  });

  it('allows the deploy-time primary URL without a code change', () => {
    const env = { PRODUCTION_URL: 'https://shop.example.com/', CORS_EXTRA_ORIGINS: 'https://a.example.com, https://b.example.com' } as unknown as NodeJS.ProcessEnv;
    expect(isAllowedOrigin('https://shop.example.com', env)).toBe(true);
    expect(isAllowedOrigin('https://a.example.com', env)).toBe(true);
    expect(isAllowedOrigin('https://b.example.com', env)).toBe(true);
  });
});
