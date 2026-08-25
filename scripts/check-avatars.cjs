const https = require('https');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(JSON.parse(buf)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve(JSON.parse(buf)));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  // Login
  const login = await post('https://maurmaket.onrender.com/api/auth/login', { email: 'dratomicslicer@gmail.com', password: 'Melmil12345' });
  const token = login.token;
  console.log('=== Dratomicslicer ===');
  console.log('avatar_url:', login.user?.avatar_url);
  console.log('store_logo_url:', login.user?.store_logo_url);

  // Get some seller profiles with avatars
  const products = await get('https://maurmaket.onrender.com/api/products?limit=5', token);
  if (products.products) {
    for (const p of products.products) {
      const seller = p.seller;
      if (seller?.avatar_url || seller?.store_logo_url) {
        console.log(`\n=== Seller: ${seller.full_name} ===`);
        console.log('avatar_url:', seller.avatar_url);
        console.log('store_logo_url:', seller.store_logo_url);
      }
    }
  }
})();
