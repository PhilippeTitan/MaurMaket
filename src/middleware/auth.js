import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { JWT_SECRET } from '../config/security.js';

function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    } catch {}
  }
  next();
}

// Auth middleware
async function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    // Re-check identity against the DB on every request rather than trusting
    // the JWT's embedded role/email. This closes the gap where a deleted or
    // role-changed account could keep acting on a still-valid 7-day token.
    const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [payload.id]);
    if (result.rows.length === 0 || result.rows[0].role === 'deleted') {
      return res.status(401).json({ error: 'Account no longer active' });
    }
    req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
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
