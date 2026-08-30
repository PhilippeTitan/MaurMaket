import rateLimit from 'express-rate-limit';
import { isTestMode } from '../config/database.js';

// In test mode: skip ALL rate limiting entirely to avoid CI flakiness
const testSkip = isTestMode ? (() => true) : undefined;

const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' }, skip: testSkip || ((req) => req.path === '/health') });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, try again later' }, skip: testSkip });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many payment requests, try again later' }, skip: testSkip });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many uploads, try again later' }, skip: testSkip });
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages, try again later' }, skip: testSkip });
const convLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many conversations, try again later' }, skip: testSkip });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many verification attempts — try again in 15 minutes' }, skip: testSkip });

export { generalLimiter, authLimiter, paymentLimiter, uploadLimiter, msgLimiter, convLimiter, verifyLimiter };
