import { pool } from '../config/database.js';
import { getAuth } from '../config/auth.js';
import { fromNodeHeaders } from 'better-auth/node';
import { isAtLeast18 } from '../utils/helpers.js';

/**
 * Validate the Bearer token through Better Auth so its bearer plugin can decode
 * the set-auth-token format before looking up the session in the configured DB.
 * Returns { userId, email } or null for a token that is not a Better Auth session.
 */
async function getBetterAuthUser(req) {
  const auth = getAuth();
  const authContext = await auth.$context;
  const cookieName = authContext.authCookies.sessionToken.name;
  const bearerToken = req.headers.authorization.slice(7).trim();
  const headers = fromNodeHeaders(req.headers);
  const cookies = (headers.get('cookie') || '')
    .split(';')
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie && cookie.slice(0, cookie.indexOf('=')) !== cookieName);
  // The bearer plugin performs this conversion on HTTP requests. Internal
  // Better Auth API calls read the signed cookie directly, so mirror the
  // conversion here while preserving any other request cookies.
  cookies.push(`${cookieName}=${bearerToken}`);
  headers.set('cookie', cookies.join('; '));
  const sessionData = await auth.api.getSession({ headers });
  if (!sessionData?.user?.id) return null;
  return { userId: sessionData.user.id, email: sessionData.user.email };
}

async function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    // Try Better Auth first
    try {
      const baUser = await getBetterAuthUser(req);
      if (baUser) {
        const result = await pool.query('SELECT id, email, role, email_verified FROM users WHERE id = $1', [baUser.userId]);
        if (result.rows.length > 0) {
          req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role, email_verified: result.rows[0].email_verified };
          return next();
        }
      }
    } catch (err) {
      console.error('[AUTH-MW] Better Auth validation failed:', err.message);
    }
  }
  next();
}

// Better Auth is the sole session authority. Supabase is used only for data services.
async function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 1) Try Better Auth session first. Its API applies the Bearer plugin's
  // token decoding and reads through the same adapter used by Better Auth.
  let baUser;
  try {
    baUser = await getBetterAuthUser(req);
  } catch (error) {
    console.error('[AUTH-MW] Better Auth session validation error:', error.message);
    return res.status(503).json({ error: 'Authentication service temporarily unavailable' });
  }
  if (baUser) {
    try {
      const result = await pool.query('SELECT id, email, role, email_verified FROM users WHERE id = $1', [baUser.userId]);
      if (result.rows.length === 0 || result.rows[0].role === 'deleted') {
        return res.status(401).json({ error: 'Account no longer active' });
      }
      req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role, email_verified: result.rows[0].email_verified };
      return next();
    } catch (error) {
      console.error('[AUTH-MW] Better Auth profile lookup error:', error.message);
      return res.status(503).json({ error: 'Authentication service temporarily unavailable' });
    }
  }

  return res.status(401).json({ error: 'Invalid token' });
}

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  next();
}

// Identity verification required to sell — applies to EVERY seller tier.
// Seller tier is a separate entitlement that only controls listing caps/benefits
// (see src/utils/listingPolicy.js), never whether someone may sell at all.
async function verifiedSellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  try {
    const result = await pool.query('SELECT seller_tier, id_verified FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    const { seller_tier: tier, id_verified: idVerified } = result.rows[0];
    if (tier === 'none') {
      return res.status(403).json({ error: 'Seller access required' });
    }
    if (!idVerified) {
      return res.status(403).json({
        error: 'Verification required',
        code: 'VERIFICATION_REQUIRED',
        message: 'You need to verify your identity before listing products. Go to Settings > Verification to get started.',
      });
    }
    next();
  } catch (err) {
    console.error('verifiedSellerRequired error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DOB required middleware — blocks write actions for Google OAuth users who haven't confirmed age
async function dobRequired(req, res, next) {
  try {
    const result = await pool.query('SELECT date_of_birth FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    if (!result.rows[0].date_of_birth) {
      return res.status(403).json({ error: 'Date of birth required to continue', code: 'PENDING_DOB' });
    }
    if (!isAtLeast18(result.rows[0].date_of_birth)) {
      return res.status(403).json({ error: 'You must be at least 18 years old to continue', code: 'UNDERAGE_ACCOUNT' });
    }
    next();
  } catch (err) {
    console.error('dobRequired error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export { optionalAuth, authRequired, sellerRequired, verifiedSellerRequired, dobRequired };
