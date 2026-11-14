'use strict';
// CouponShop HTTP server. Zero npm dependencies (Node >= 22.13).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createCore, AppError } = require('./lib/core');

const DEV = process.env.DEV_MODE === '1';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const SMS_WEBHOOK_URL = process.env.SMS_WEBHOOK_URL || '';
const PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

function loadSecret() {
  if (process.env.SECRET_KEY) return process.env.SECRET_KEY;
  if (!DEV) {
    console.error('SECRET_KEY (32+ chars) is required. Use DEV_MODE=1 for local development.');
    process.exit(1);
  }
  const f = path.join(DATA_DIR, 'dev-secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8');
}
if (!DEV && !GOOGLE_CLIENT_ID) {
  console.error('GOOGLE_CLIENT_ID is required outside DEV_MODE.');
  process.exit(1);
}

const core = createCore({ dbFile: path.join(DATA_DIR, 'couponshop.db'), dataDir: DATA_DIR, secret: loadSecret() });
setInterval(() => { try { core.settleDue(); } catch (e) { console.error('settle failed', e); } }, 60e3).unref();

// ---------- small helpers ----------
const fail = (status, msg) => { throw new AppError(status, msg); };

const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < t) { b = { n: 0, reset: t + windowMs }; buckets.set(key, b); }
  if (++b.n > max) fail(429, 'Too many requests. Please slow down');
}
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60e3).unref();

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AppError(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cookieToken(req) {
  const m = /(?:^|;\s*)sid=([A-Za-z0-9_-]{20,100})/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
const sessionCookie = (token, maxAge) =>
  `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${DEV ? '' : '; Secure'}`;

const CSP = [
  "default-src 'self'",
  "script-src 'self'" + (GOOGLE_CLIENT_ID ? ' https://accounts.google.com/gsi/client' : ''),
  "style-src 'self'" + (GOOGLE_CLIENT_ID ? ' https://accounts.google.com/gsi/style' : ''),
  "connect-src 'self'" + (GOOGLE_CLIENT_ID ? ' https://accounts.google.com/gsi/' : ''),
  'frame-src ' + (GOOGLE_CLIENT_ID ? 'https://accounts.google.com/gsi/' : "'none'"),
  "img-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function baseHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', GOOGLE_CLIENT_ID ? 'same-origin-allow-popups' : 'same-origin');
  if (!DEV) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// ---------- Google ID token verification (RS256 against Google's published keys) ----------
let jwks = { keys: [], at: 0 };
async function googleKeys() {
  if (Date.now() - jwks.at > HOUR_MS || !jwks.keys.length) {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) fail(502, 'Could not reach Google');
    jwks = { keys: (await r.json()).keys, at: Date.now() };
  }
  return jwks.keys;
}
const HOUR_MS = 3600e3;

async function verifyGoogleToken(idToken) {
  if (typeof idToken !== 'string' || idToken.length > 4096) fail(400, 'Bad token');
  const parts = idToken.split('.');
  if (parts.length !== 3) fail(400, 'Bad token');
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch { fail(400, 'Bad token'); }
  if (header.alg !== 'RS256') fail(401, 'Bad token');
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) fail(401, 'Bad token');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) fail(401, 'Bad token');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) fail(401, 'Bad token');
  if (claims.aud !== GOOGLE_CLIENT_ID) fail(401, 'Bad token');
  if (!(claims.exp * 1000 > Date.now())) fail(401, 'Token expired');
  if (!claims.sub || !claims.email || claims.email_verified !== true) fail(401, 'Google email not verified');
  return { sub: String(claims.sub), email: String(claims.email), name: String(claims.name || '') };
}

async function deliverOtp(phone, code) {
  if (SMS_WEBHOOK_URL) {
    const r = await fetch(SMS_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ to: '+91' + phone, message: `${code} is your CouponShop code. Valid for 5 minutes.` }),
    });
    if (!r.ok) fail(502, 'Could not send SMS. Try again');
    return {};
  }
  if (DEV) { console.log(`[dev] OTP for ${phone}: ${code}`); return { dev_code: code }; }
  fail(503, 'SMS is not configured');
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, opts });
const idOf = (m) => Number(m[1]);

route('GET', /^\/api\/me$/, ({ user }) => ({
  user: core.profile(user),
  config: { dev: DEV, google_client_id: GOOGLE_CLIENT_ID, rules: core.RULES, categories: core.CATEGORIES },
}));

function login(res, profile) {
  const user = core.upsertGoogleUser(profile, ADMIN_EMAILS);
  res.setHeader('Set-Cookie', sessionCookie(core.createSession(user.id), 7 * 24 * 3600));
  return { ok: true };
}
route('POST', /^\/api\/auth\/google$/, async ({ body, res, ip }) => {
  rateLimit('auth:' + ip, 10, 60e3);
  if (!GOOGLE_CLIENT_ID) fail(503, 'Google Sign-In is not configured');
  return login(res, await verifyGoogleToken(body.credential));
});
route('POST', /^\/api\/auth\/dev$/, ({ body, res, ip }) => {
  if (!DEV) fail(404, 'Not found');
  rateLimit('auth:' + ip, 10, 60e3);
  if (typeof body.email !== 'string' || !/^[^@\s]{1,60}@[^@\s]{1,60}$/.test(body.email)) fail(400, 'Enter an email');
  const email = body.email.toLowerCase();
  return login(res, { sub: 'dev:' + email, email, name: email.split('@')[0] });
});
route('POST', /^\/api\/auth\/logout$/, ({ req, res }) => {
  core.destroySession(cookieToken(req));
  res.setHeader('Set-Cookie', sessionCookie('x', 0));
  return { ok: true };
});

route('POST', /^\/api\/phone\/start$/, async ({ user, body, ip }) => {
  if (!user) fail(401, 'Please sign in');
  rateLimit('otp-ip:' + ip, 6, HOUR_MS);
  rateLimit('otp-user:' + user.id, 3, HOUR_MS);
  if (typeof body.phone === 'string') rateLimit('otp-phone:' + body.phone, 3, HOUR_MS);
  const code = core.startPhone(user, body.phone, body.age18);
  return { ok: true, ...(await deliverOtp(body.phone, code)) };
});
route('POST', /^\/api\/phone\/verify$/, ({ user, body }) => {
  if (!user) fail(401, 'Please sign in');
  rateLimit('otp-verify:' + user.id, 10, HOUR_MS);
  return core.verifyPhone(user, body.code);
});

route('GET', /^\/api\/listings$/, ({ url }) => core.browse({ search: url.searchParams.get('q') || '', category: url.searchParams.get('category') || '' }));
route('POST', /^\/api\/listings$/, ({ user, body }) => {
  if (user) rateLimit('list:' + user.id, 20, 24 * HOUR_MS);
  return core.createListing(user, body);
}, { bodyLimit: 3.2 * 1024 * 1024 });
route('GET', /^\/api\/my\/listings$/, ({ user }) => core.myListings(user));
route('POST', /^\/api\/listings\/(\d+)\/remove$/, ({ user, m }) => core.removeListing(user, idOf(m)));
route('POST', /^\/api\/listings\/(\d+)\/buy$/, ({ user, m }) => {
  if (user) rateLimit('buy:' + user.id, 20, 60e3);
  return core.buy(user, idOf(m));
});
route('POST', /^\/api\/listings\/(\d+)\/claim\/start$/, ({ user, m }) => core.startClaim(user, idOf(m)));
route('POST', /^\/api\/listings\/(\d+)\/claim\/finish$/, ({ user, m }) => core.finishClaim(user, idOf(m)));
route('GET', /^\/api\/my\/purchases$/, ({ user }) => core.myPurchases(user));
route('POST', /^\/api\/trades\/(\d+)\/report$/, ({ user, m, body }) => core.reportTrade(user, idOf(m), body.reason, body.details));

route('GET', /^\/api\/wallet$/, ({ user }) => core.wallet(user));
route('POST', /^\/api\/topup$/, ({ user, body }) => {
  if (!DEV && !PAYMENT_WEBHOOK_SECRET) fail(503, 'Payments are not configured');
  if (user) rateLimit('topup:' + user.id, 10, HOUR_MS);
  return core.createTopup(user, body.amount);
});
route('POST', /^\/api\/dev\/pay$/, ({ user, body }) => {
  if (!DEV) fail(404, 'Not found');
  if (!user) fail(401, 'Please sign in');
  const p = core.db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(String(body.order_id), user.id);
  if (!p) fail(404, 'Unknown order');
  return core.confirmTopup(p.id, 'dev_' + p.id, p.amount);
});
// Payment gateway -> server. Authenticated by HMAC-SHA256 of the raw body, not by cookies.
route('POST', /^\/api\/webhooks\/payment$/, ({ req, raw }) => {
  if (!PAYMENT_WEBHOOK_SECRET) fail(503, 'Payments are not configured');
  const want = crypto.createHmac('sha256', PAYMENT_WEBHOOK_SECRET).update(raw).digest();
  const got = Buffer.from(String(req.headers['x-signature'] || ''), 'hex');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) fail(401, 'Bad signature');
  const b = JSON.parse(raw.toString('utf8'));
  if (b.status !== 'paid') return { ignored: true };
  return core.confirmTopup(b.order_id, b.payment_id, b.amount);
}, { webhook: true });

route('POST', /^\/api\/seller\/activate$/, ({ user }) => core.activateSeller(user));
route('POST', /^\/api\/seller\/release-deposit$/, ({ user }) => core.releaseDeposit(user));
route('POST', /^\/api\/withdrawals$/, ({ user, body }) => core.requestWithdrawal(user, body.amount));

route('GET', /^\/api\/admin\/queue$/, ({ user }) => core.adminQueue(user));
route('GET', /^\/api\/admin\/screenshot\/(\d+)$/, ({ user, m, res }) => {
  const file = core.screenshotPath(user, idOf(m));
  const type = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(file)];
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
  res.end(fs.readFileSync(file));
  return undefined;
});
route('POST', /^\/api\/admin\/listings\/(\d+)\/review$/, ({ user, m, body }) => core.reviewListing(user, idOf(m), body.approve === true, body.reason));
route('POST', /^\/api\/admin\/reports\/(\d+)\/resolve$/, ({ user, m, body }) => core.resolveReport(user, idOf(m), body.outcome));
route('POST', /^\/api\/admin\/withdrawals\/(\d+)\/resolve$/, ({ user, m, body }) => core.resolveWithdrawal(user, idOf(m), body.fulfil === true, body.voucher));
route('POST', /^\/api\/admin\/users\/(\d+)\/terminate$/, ({ user, m, body }) => core.adminTerminate(user, idOf(m), body.reason));

// ---------- static files (fixed whitelist, no path handling) ----------
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

async function handle(req, res) {
  baseHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  const ip = clientIp(req);

  if (!url.pathname.startsWith('/api/')) {
    const s = STATIC[url.pathname];
    if (!s || req.method !== 'GET') { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': s[1], 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'public', s[0])));
    return;
  }

  rateLimit('api:' + ip, 240, 60e3);
  const r = routes.find((x) => x.method === req.method && x.pattern.test(url.pathname));
  if (!r) fail(404, 'Not found');
  const m = r.pattern.exec(url.pathname);

  let body = {}, raw = Buffer.alloc(0), user = null;
  if (req.method === 'POST') {
    if (!r.opts.webhook) {
      // CSRF: SameSite=Strict cookie + same-origin check + a header browsers won't send cross-site.
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) fail(403, 'Cross-site request blocked');
      if (req.headers['x-csrf'] !== '1') fail(403, 'Missing CSRF header');
      if (!/^application\/json/.test(req.headers['content-type'] || '')) fail(415, 'JSON only');
    }
    raw = await readBody(req, r.opts.bodyLimit || 16 * 1024);
    if (!r.opts.webhook) {
      try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { fail(400, 'Invalid JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid JSON');
    }
  }
  if (!r.opts.webhook) user = core.sessionUser(cookieToken(req));

  const out = await r.handler({ req, res, url, m, body, raw, user, ip });
  if (out !== undefined) sendJson(res, 200, out);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof AppError) return sendJson(res, e.status, { error: e.message });
    console.error(e);
    sendJson(res, 500, { error: 'Something went wrong' });
  });
});
server.headersTimeout = 10e3;
server.requestTimeout = 30e3;

server.listen(PORT, () => {
  console.log(`CouponShop running on http://localhost:${PORT}${DEV ? '  (DEV MODE: fake login, OTP and payments)' : ''}`);
});
