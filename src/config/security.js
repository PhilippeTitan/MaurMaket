const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const BCRYPT_ROUNDS = 10;
const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com';

export { JWT_SECRET, BCRYPT_ROUNDS, PRODUCTION_URL };
