import { pool } from '../config/database.js';
import { supabase } from '../config/supabase.js';

async function getSupabaseUser(token) {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}

async function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const supabaseUser = await getSupabaseUser(auth.slice(7));
    if (supabaseUser) {
      req.supabaseUser = supabaseUser;
      req.user = { id: supabaseUser.id, email: supabaseUser.email, role: 'buyer' };
    }
  }
  next();
}

// Auth middleware
async function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.slice(7);

  try {
    const supabaseUser = await getSupabaseUser(token);
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
    // Invalid or expired Supabase access token.
  }

  return res.status(401).json({ error: 'Invalid Supabase token' });
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
