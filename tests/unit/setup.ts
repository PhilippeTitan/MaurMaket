// Runs before every test file: satisfy module-level env requirements so
// server-adjacent utils (database.js, security.js) can be imported without a live DB.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgres://ci:ci@127.0.0.1:5432/vitest_placeholder';
process.env.JWT_SECRET ||= 'vitest_placeholder_secret';
