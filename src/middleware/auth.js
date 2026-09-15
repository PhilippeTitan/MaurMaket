import { pool } from '../config/database.js';
import { supabase } from '../config/supabase.js';

async function getSupabaseUser(token) {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

/**
 * Validate a Better Auth session token by querying the sessions table directly.
 * Better Auth's auth.api.getSession() only works with cookie-based sessions (via toNodeHandler).
 * For Bearer token validation from custom middleware, we query the DB directly.
 * Returns { userId, email } or null.
 */
async function getBetterAuthUser(token) {
  try {
    const result = await pool.query(
      `SELECT s.user_id, s.expires_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return { userId: row.user_id, email: row.email };
    }
  } catch (err) {
    console.log('[AUTH-MW] Session lookup error:', err.message);
  }
  return null;
}

async function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    // Try Better Auth first
    const baUser = await getBetterAuthUser(token);
    if (baUser) {
      const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [baUser.userId]);
      if (result.rows.length > 0) {
        req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
        return next();
      }
    }
    // Fall back to Supabase
    const supabaseUser = await getSupabaseUser(token);
    if (supabaseUser) {
      req.user = { id: supabaseUser.id, email: supabaseUser.email, role: 'buyer' };
    }
  }
  next();
}

// Auth middleware — supports both Better Auth and Supabase tokens
async function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 1) Try Better Auth session first
  try {
    const baUser = await getBetterAuthUser(auth.slice(7));
    if (baUser) {
      const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [baUser.userId]);
      if (result.rows.length === 0 || result.rows[0].role === 'deleted') {
        return res.status(401).json({ error: 'Account no longer active' });
      }
      req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
      return next();
    }
  } catch {
    // Not a Better Auth token — try Supabase below
  }

  // 2) Fall back to Supabase validation (backward compatibility)
  try {
    const supabaseUser = await getSupabaseUser(auth.slice(7));
    if (supabaseUser) {
      const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [supabaseUser.id]);
      if (result.rows.length === 0 || result.rows[0].role === 'deleted') {
        return res.status(401).json({ error: 'Account no longer active' });
      }
      req.supabaseUser = supabaseUser;
      req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
      return next();
    }
  } catch {
    // Invalid Supabase token
  }

  return res.status(401).json({ error: 'Invalid token' });
}

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  next();
}

// Verified seller required — casual sellers can buy but not list products
async function verifiedSellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  try {
    const result = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    const tier = result.rows[0].seller_tier;
    if (tier === 'casual' || tier === 'none') {
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
    next();
  } catch (err) {
    console.error('dobRequired error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export { optionalAuth, authRequired, sellerRequired, verifiedSellerRequired, dobRequired };
