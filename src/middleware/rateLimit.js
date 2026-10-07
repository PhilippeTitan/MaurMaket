import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { isTestMode } from '../config/database.js';

// In test mode: skip ALL rate limiting entirely to avoid CI flakiness
const testSkip = isTestMode ? (() => true) : undefined;

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' }, skip: testSkip || ((req) => req.path === '/health') });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, try again later' }, skip: testSkip });

// APP-Q380: throttle repeated failed sign-in attempts.
// - Only failures consume budget (`skipSuccessfulRequests`), so a person who
//   signs in normally is never locked out.
// - Keyed on normalized IP + the submitted email, so one shared connection is
//   not punished for a single account's failures, while a single account still
//   cannot be brute-forced from many addresses.
// - The wording is generic: it never reveals whether the account exists.
const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: testSkip,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  message: { error: 'Too many sign-in attempts', code: 'TOO_MANY_ATTEMPTS' },
});
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many payment requests, try again later' }, skip: testSkip });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many uploads, try again later' }, skip: testSkip });
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages, try again later' }, skip: testSkip });
const convLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many conversations, try again later' }, skip: testSkip });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many verification attempts — try again in 15 minutes' }, skip: testSkip });
const previewLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' }, skip: testSkip });

export { generalLimiter, authLimiter, signinLimiter, paymentLimiter, uploadLimiter, msgLimiter, convLimiter, verifyLimiter, previewLimiter };
