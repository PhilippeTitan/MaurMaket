/**
 * One-time Gmail OAuth helper
 * Run: node scripts/get-gmail-refresh-token.mjs
 * 
 * 1. Opens browser for Google consent
 * 2. You authorize "MaurMaket" to send email
 * 3. Prints your refresh token — add it to .env as GMAIL_REFRESH_TOKEN
 */

import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import { createInterface } from 'readline';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '273654218158-1d5a7pmsaj5ql6ejshbbi5igjaqe22nh.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3999/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

if (!CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_SECRET first:');
  console.error('  export GOOGLE_CLIENT_SECRET="GOCSPX-..."');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force consent to get refresh_token
});

console.log('\n🔗 Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for authorization...\n');

// Try to open browser automatically
import('open').then(({ default: open }) => open(authUrl)).catch(() => {});

// Start local server to catch redirect
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/oauth2callback') {
    const code = parsed.query.code;
    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Authorization successful!</h1><p>Check terminal for your refresh token.</p>');
        console.log('✅ GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\nAdd this to your .env and Render env vars.');
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ Error</h1><p>' + err.message + '</p>');
        console.error('Token exchange error:', err.message);
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ No code received</h1>');
    }
    server.close();
    process.exit(0);
  }
});

server.listen(3999, () => {
  console.log('Listening on http://localhost:3999...');
});
