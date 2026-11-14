'use strict';
// All CouponShop business rules live here. No HTTP in this file.
// Every money movement goes through post() inside a single DB transaction.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./db');

const HOUR = 3600e3;
const DAY = 24 * HOUR;

const RULES = Object.freeze({
  FEE: 1,                    // platform fee per paid sale, added on top of seller price
  MAX_PRICE: 25,             // seller price 1-25 (0 = free giveaway)
  DEPOSIT: 100,              // locked seller deposit
  REAPPLY_FEE: 50,           // non-refundable, after termination
  REAPPLY_WAIT: 90 * DAY,
  MAX_TERMINATIONS: 3,       // third termination = permanent seller ban
  STRIKES_TO_TERMINATE: 3,
  REPORT_WINDOW: DAY,        // also the escrow period for seller earnings
  MIN_WITHDRAW: 200,
  GOOD_SALES_FOR_DEPOSIT: 10,
  TRUST_MIN_TRADES: 5,
  TOPUP_MIN: 10,
  TOPUP_MAX: 2000,
  MAX_BALANCE: 10000,
  AD_SECONDS: 15,
  FREE_CLAIMS_PER_DAY: 3,
  OTP_TTL: 5 * 60e3,
  OTP_MAX_ATTEMPTS: 5,
  SESSION_TTL: 7 * DAY,
  MAX_SCREENSHOT_BYTES: 2 * 1024 * 1024,
});

const CATEGORIES = ['Food', 'Shopping', 'Travel', 'Entertainment', 'Recharge', 'Other'];
const REPORT_REASONS = ['invalid', 'expired', 'mismatch'];

class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, msg) => { throw new AppError(status, msg); };

function cleanText(v, field, min, max) {
  if (typeof v !== 'string') fail(400, `${field} is required`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length < min || s.length > max) fail(400, `${field} must be ${min}-${max} characters`);
  return s;
}
function cleanInt(v, field, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) fail(400, `${field} must be a whole number from ${min} to ${max}`);
  return v;
}

function imageType(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function createCore({ dbFile = ':memory:', dataDir, secret, clock = { now: () => Date.now() } }) {
  if (!secret || secret.length < 32) throw new Error('secret must be at least 32 characters');
  const db = openDb(dbFile);
  const shotDir = path.join(dataDir, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true, mode: 0o700 });

  const encKey = Buffer.from(crypto.hkdfSync('sha256', secret, '', 'couponshop-enc', 32));
  const macKey = Buffer.from(crypto.hkdfSync('sha256', secret, '', 'couponshop-mac', 32));
  const now = () => clock.now();
  const today = () => new Date(now() + 5.5 * HOUR).toISOString().slice(0, 10); // IST date

  const q = (sql) => db.prepare(sql);
  const mac = (s) => crypto.createHmac('sha256', macKey).update(s).digest('hex');

  function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', encKey, iv);
    const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
  }
  function decrypt(b64) {
    const raw = Buffer.from(b64, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', encKey, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  }

  let inTx = false;
  function tx(fn) {
    if (inTx) return fn();
    db.exec('BEGIN IMMEDIATE');
    inTx = true;
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      // CHECK constraints on wallet buckets are the last line of defence against overdrafts.
      if (!(e instanceof AppError) && /CHECK constraint/.test(String(e.message))) throw new AppError(400, 'Not enough coins');
      throw e;
    } finally { inTx = false; }
  }

  // The only way coins move. userId null = platform.
  function post(userId, type, amount, bucket, listingId = null, ref = null) {
    if (userId !== null && bucket !== 'none' && amount !== 0) {
      q(`UPDATE users SET ${bucket} = ${bucket} + ? WHERE id = ?`).run(amount, userId);
    }
    q('INSERT INTO ledger (user_id, type, amount, bucket, listing_id, ref, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(userId, type, amount, userId === null ? 'platform' : bucket, listingId, ref, now());
  }

  const getUser = (id) => q('SELECT * FROM users WHERE id = ?').get(id);

  function mustBeActive(user) {
    if (!user) fail(401, 'Please sign in');
    if (user.suspended) fail(403, 'Your account is suspended');
    if (!user.phone_verified_at) fail(403, 'Verify your phone number first');
  }

  // ---------- accounts & sessions ----------
  function upsertGoogleUser({ sub, email, name }, adminEmails = []) {
    const isAdmin = adminEmails.includes(String(email).toLowerCase()) ? 1 : 0;
    const existing = q('SELECT id FROM users WHERE google_sub = ?').get(sub);
    if (existing) {
      q('UPDATE users SET email = ?, is_admin = ? WHERE id = ?').run(email, isAdmin, existing.id);
      return getUser(existing.id);
    }
    const r = q('INSERT INTO users (google_sub, email, name, is_admin, created_at) VALUES (?,?,?,?,?)')
      .run(sub, email, String(name || email.split('@')[0]).slice(0, 60), isAdmin, now());
    return getUser(Number(r.lastInsertRowid));
  }

  function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    q('DELETE FROM sessions WHERE expires_at < ?').run(now());
    q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(mac(token), userId, now() + RULES.SESSION_TTL);
    return token;
  }
  function sessionUser(token) {
    if (!token) return null;
    const s = q('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(mac(token), now());
    return s ? getUser(s.user_id) : null;
  }
  function destroySession(token) {
    if (token) q('DELETE FROM sessions WHERE token_hash = ?').run(mac(token));
  }

  // ---------- phone OTP ----------
  function startPhone(user, phone, age18) {
    if (!user) fail(401, 'Please sign in');
    if (user.phone_verified_at) fail(400, 'Phone already verified');
    if (age18 !== true) fail(400, 'You must confirm you are 18 or older');
    if (typeof phone !== 'string' || !/^[6-9]\d{9}$/.test(phone)) fail(400, 'Enter a valid 10-digit Indian mobile number');
    if (q('SELECT 1 FROM users WHERE phone = ?').get(phone)) fail(409, 'This phone number is already linked to an account');
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    q('INSERT OR REPLACE INTO otps (user_id, phone, code_hash, expires_at, attempts) VALUES (?,?,?,?,0)')
      .run(user.id, phone, mac(`otp:${user.id}:${phone}:${code}`), now() + RULES.OTP_TTL);
    return code; // caller delivers it by SMS; never sent to the browser in production
  }

  function verifyPhone(user, code) {
    if (!user) fail(401, 'Please sign in');
    return tx(() => {
      const o = q('SELECT * FROM otps WHERE user_id = ?').get(user.id);
      if (!o || o.expires_at < now()) fail(400, 'Code expired. Request a new one');
      if (o.attempts >= RULES.OTP_MAX_ATTEMPTS) fail(429, 'Too many wrong attempts. Request a new code');
      const given = Buffer.from(mac(`otp:${user.id}:${o.phone}:${String(code)}`));
      if (!crypto.timingSafeEqual(given, Buffer.from(o.code_hash))) {
        // Counted outside the rolled-back transaction below.
        return { wrong: true };
      }
      if (q('SELECT 1 FROM users WHERE phone = ?').get(o.phone)) fail(409, 'This phone number is already linked to an account');
      q('UPDATE users SET phone = ?, phone_verified_at = ?, age_confirmed_at = ? WHERE id = ?').run(o.phone, now(), now(), user.id);
      q('DELETE FROM otps WHERE user_id = ?').run(user.id);
      return { ok: true };
    });
  }
  function verifyPhoneChecked(user, code) {
    const r = verifyPhone(user, code);
    if (r.wrong) {
      q('UPDATE otps SET attempts = attempts + 1 WHERE user_id = ?').run(user.id);
      fail(400, 'Wrong code');
    }
    return r;
  }

  // ---------- top-ups (1 coin = Rs 1) ----------
  function createTopup(user, amount) {
    mustBeActive(user);
    cleanInt(amount, 'Amount', RULES.TOPUP_MIN, RULES.TOPUP_MAX);
    if (user.balance + amount > RULES.MAX_BALANCE) fail(400, `Wallet limit is ${RULES.MAX_BALANCE} coins`);
    const id = 'ord_' + crypto.randomBytes(12).toString('hex');
    q('INSERT INTO payments (id, user_id, amount, created_at) VALUES (?,?,?,?)').run(id, user.id, amount, now());
    return { order_id: id, amount };
  }

  // Called only from a signature-verified payment webhook (or the dev simulator).
  function confirmTopup(orderId, providerRef, amountPaid) {
    return tx(() => {
      const p = q('SELECT * FROM payments WHERE id = ?').get(String(orderId));
      if (!p) fail(404, 'Unknown order');
      if (p.status === 'paid') return { already: true };
      if (amountPaid !== p.amount) fail(400, 'Amount mismatch');
      if (q('SELECT 1 FROM payments WHERE provider_ref = ?').get(String(providerRef))) fail(409, 'Payment already used');
      q("UPDATE payments SET status = 'paid', provider_ref = ?, paid_at = ? WHERE id = ?").run(String(providerRef), now(), p.id);
      post(p.user_id, 'topup', p.amount, 'balance', null, p.id);
      return { ok: true };
    });
  }

  // ---------- seller status ----------
  function terminateSeller(sellerId, reason) {
    const u = getUser(sellerId);
    if (u.seller_status !== 'active') return;
    const terminations = u.terminations + 1;
    const status = terminations >= RULES.MAX_TERMINATIONS ? 'banned' : 'terminated';
    if (u.locked > 0) {
      post(u.id, 'deposit_forfeit', -u.locked, 'locked', null, reason);
      post(null, 'deposit_forfeit', u.locked, 'platform', null, `user:${u.id}`);
    }
    q('UPDATE users SET seller_status = ?, terminations = ?, terminated_at = ? WHERE id = ?').run(status, terminations, now(), u.id);
    q("UPDATE listings SET status = 'removed', code_hash = NULL WHERE seller_id = ? AND status IN ('pending','live')").run(u.id);
  }

  function activateSeller(user) {
    mustBeActive(user);
    return tx(() => {
      const u = getUser(user.id);
      if (u.seller_status === 'active') fail(400, 'You are already a seller');
      if (u.seller_status === 'banned') fail(403, 'You are permanently blocked from selling');
      if (u.seller_status === 'terminated') {
        if (now() < u.terminated_at + RULES.REAPPLY_WAIT) {
          const days = Math.ceil((u.terminated_at + RULES.REAPPLY_WAIT - now()) / DAY);
          fail(403, `You can reapply in ${days} day(s)`);
        }
        post(u.id, 'reapply_fee', -RULES.REAPPLY_FEE, 'balance');
        post(null, 'reapply_fee', RULES.REAPPLY_FEE, 'platform', null, `user:${u.id}`);
        q('UPDATE users SET strikes = 0 WHERE id = ?').run(u.id);
      }
      post(u.id, 'deposit_lock', -RULES.DEPOSIT, 'balance');
      post(u.id, 'deposit_lock', RULES.DEPOSIT, 'locked');
      q("UPDATE users SET seller_status = 'active', seller_since = ? WHERE id = ?").run(now(), u.id);
      return { ok: true };
    });
  }

  function goodSales(u) {
    return q("SELECT COUNT(*) n FROM trades WHERE seller_id = ? AND settled = 1 AND outcome = 'ok' AND created_at >= ?")
      .get(u.id, u.seller_since || 0).n;
  }
  function openReportsAgainst(userId) {
    return q("SELECT COUNT(*) n FROM reports r JOIN trades t ON t.id = r.trade_id WHERE t.seller_id = ? AND r.status = 'open'").get(userId).n;
  }

  // Releasing the deposit ends seller status; the user can re-activate any time.
  function releaseDeposit(user) {
    mustBeActive(user);
    return tx(() => {
      settleDue();
      const u = getUser(user.id);
      if (u.seller_status !== 'active') fail(400, 'No deposit to release');
      if (goodSales(u) < RULES.GOOD_SALES_FOR_DEPOSIT) fail(400, `You need ${RULES.GOOD_SALES_FOR_DEPOSIT} confirmed good sales first`);
      if (openReportsAgainst(u.id) > 0) fail(400, 'You have unresolved reports');
      if (q('SELECT 1 FROM trades WHERE seller_id = ? AND settled = 0').get(u.id)) fail(400, 'Wait until all your sales clear the 24-hour window');
      post(u.id, 'deposit_release', -u.locked, 'locked');
      post(u.id, 'deposit_release', u.locked, 'balance');
      q("UPDATE users SET seller_status = 'none' WHERE id = ?").run(u.id);
      q("UPDATE listings SET status = 'removed', code_hash = NULL WHERE seller_id = ? AND status IN ('pending','live')").run(u.id);
      return { ok: true };
    });
  }

  // ---------- trust ----------
  function trust(userId) {
    const r = q(`SELECT COUNT(*) total, COALESCE(SUM(outcome = 'ok'), 0) good FROM trades
                 WHERE seller_id = ? AND (settled = 1 OR outcome = 'refunded')`).get(userId);
    return { trades: r.total, percent: r.total >= RULES.TRUST_MIN_TRADES ? Math.round((r.good / r.total) * 100) : null };
  }

  // ---------- listings ----------
  function createListing(user, input) {
    mustBeActive(user);
    if (user.seller_status !== 'active') fail(403, 'Become a seller first');
    const brand = cleanText(input.brand, 'Brand', 2, 40);
    if (!CATEGORIES.includes(input.category)) fail(400, 'Pick a category');
    const discount = cleanText(input.discount, 'Discount', 2, 60);
    const terms = input.terms ? cleanText(input.terms, 'Terms', 0, 200) : '';
    const code = cleanText(input.code, 'Coupon code', 3, 100);
    const price = cleanInt(input.price, 'Price', 0, RULES.MAX_PRICE);
    if (typeof input.expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry) || Number.isNaN(Date.parse(input.expiry))) fail(400, 'Enter a valid expiry date');
    if (input.expiry <= today()) fail(400, 'Coupon must be valid for at least one more day');

    if (typeof input.screenshot !== 'string') fail(400, 'Screenshot is required');
    const img = Buffer.from(input.screenshot, 'base64');
    if (img.length === 0 || img.length > RULES.MAX_SCREENSHOT_BYTES) fail(400, 'Screenshot must be under 2 MB');
    const ext = imageType(img);
    if (!ext) fail(400, 'Screenshot must be a PNG, JPEG or WebP image');

    const codeHash = mac(`code:${brand.toLowerCase()}:${code.toUpperCase().replace(/\s+/g, '')}`);
    if (q('SELECT 1 FROM listings WHERE code_hash = ?').get(codeHash)) fail(409, 'This coupon has already been listed');

    const file = crypto.randomBytes(16).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(shotDir, file), img, { mode: 0o600 });
    const r = q(`INSERT INTO listings (seller_id, brand, category, discount, terms, expiry, price, code_enc, code_hash, screenshot_file, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, brand, input.category, discount, terms, input.expiry, price, encrypt(code), codeHash, file, now());
    return { id: Number(r.lastInsertRowid) };
  }

  function publicListing(l, trustCache = new Map()) {
    if (!trustCache.has(l.seller_id)) trustCache.set(l.seller_id, trust(l.seller_id));
    const t = trustCache.get(l.seller_id);
    return {
      id: l.id, brand: l.brand, category: l.category, discount: l.discount, terms: l.terms, expiry: l.expiry,
      free: l.price === 0, seller_price: l.price, fee: l.price ? RULES.FEE : 0, total: l.price ? l.price + RULES.FEE : 0,
      seller: { name: String(l.seller_name).split(' ')[0], trust: t.percent, trades: t.trades },
    };
  }

  function browse({ search = '', category = '' } = {}) {
    const like = `%${String(search).slice(0, 40).replace(/[%_\\]/g, '\\$&')}%`;
    const rows = q(`SELECT l.*, u.name seller_name FROM listings l JOIN users u ON u.id = l.seller_id
                    WHERE l.status = 'live' AND l.expiry >= ? AND (l.brand LIKE ? ESCAPE '\\' OR l.discount LIKE ? ESCAPE '\\')
                      AND (? = '' OR l.category = ?)
                    ORDER BY l.id DESC LIMIT 100`).all(today(), like, like, String(category), String(category));
    const cache = new Map();
    return rows.map((l) => publicListing(l, cache));
  }

  function myListings(user) {
    mustBeActive(user);
    return q('SELECT id, brand, category, discount, expiry, price, status, reject_reason FROM listings WHERE seller_id = ? ORDER BY id DESC LIMIT 100').all(user.id);
  }

  function removeListing(user, id) {
    mustBeActive(user);
    const r = q("UPDATE listings SET status = 'removed', code_hash = NULL WHERE id = ? AND seller_id = ? AND status IN ('pending','live')").run(id, user.id);
    if (!r.changes) fail(404, 'Listing not found');
    return { ok: true };
  }

  // Atomically take a live, unexpired listing off the market. Returns the row or fails.
  function takeListing(id, buyer, wantFree) {
    const l = q('SELECT * FROM listings WHERE id = ?').get(id);
    if (!l || l.status !== 'live' || l.expiry < today()) fail(409, 'This coupon is no longer available');
    if (l.seller_id === buyer.id) fail(400, 'You cannot take your own coupon');
    if ((l.price === 0) !== wantFree) fail(400, 'Wrong action for this listing');
    const r = q("UPDATE listings SET status = 'sold' WHERE id = ? AND status = 'live'").run(id);
    if (!r.changes) fail(409, 'This coupon is no longer available');
    return l;
  }

  function buy(user, listingId) {
    mustBeActive(user);
    return tx(() => {
      const l = takeListing(listingId, user, false);
      const total = l.price + RULES.FEE;
      if (getUser(user.id).balance < total) fail(400, 'Not enough coins. Top up your wallet');
      post(user.id, 'purchase', -total, 'balance', l.id);
      post(l.seller_id, 'sale', l.price, 'pending', l.id);          // escrow until report window closes
      post(null, 'fee', RULES.FEE, 'platform', l.id);               // fee is its own ledger line
      const t = q('INSERT INTO trades (listing_id, buyer_id, seller_id, price, fee, created_at) VALUES (?,?,?,?,?,?)')
        .run(l.id, user.id, l.seller_id, l.price, RULES.FEE, now());
      return { trade_id: Number(t.lastInsertRowid), code: decrypt(l.code_enc), paid: total };
    });
  }

  // Free giveaways: start the ad, then finish after AD_SECONDS (enforced server-side).
  function startClaim(user, listingId) {
    mustBeActive(user);
    const l = q('SELECT * FROM listings WHERE id = ?').get(listingId);
    if (!l || l.status !== 'live' || l.price !== 0 || l.expiry < today()) fail(409, 'This coupon is no longer available');
    if (l.seller_id === user.id) fail(400, 'You cannot take your own coupon');
    q('INSERT OR REPLACE INTO claims (user_id, listing_id, started_at) VALUES (?,?,?)').run(user.id, l.id, now());
    return { wait_seconds: RULES.AD_SECONDS };
  }

  function finishClaim(user, listingId) {
    mustBeActive(user);
    return tx(() => {
      const c = q('SELECT * FROM claims WHERE user_id = ? AND listing_id = ?').get(user.id, listingId);
      if (!c || now() - c.started_at < RULES.AD_SECONDS * 1000) fail(400, 'Watch the full ad first');
      if (now() - c.started_at > 10 * 60e3) fail(400, 'Ad session expired. Start again');
      const recent = q('SELECT COUNT(*) n FROM trades WHERE buyer_id = ? AND price = 0 AND created_at > ?').get(user.id, now() - DAY).n;
      if (recent >= RULES.FREE_CLAIMS_PER_DAY) fail(429, `Limit: ${RULES.FREE_CLAIMS_PER_DAY} free coupons per day`);
      const l = takeListing(listingId, user, true);
      q('DELETE FROM claims WHERE user_id = ? AND listing_id = ?').run(user.id, listingId);
      post(user.id, 'free_claim', 0, 'none', l.id);
      const t = q('INSERT INTO trades (listing_id, buyer_id, seller_id, price, fee, created_at) VALUES (?,?,?,0,0,?)')
        .run(l.id, user.id, l.seller_id, now());
      return { trade_id: Number(t.lastInsertRowid), code: decrypt(l.code_enc), paid: 0 };
    });
  }

  function myPurchases(user) {
    mustBeActive(user);
    const rows = q(`SELECT t.id, t.price, t.fee, t.created_at, t.outcome, l.brand, l.discount, l.terms, l.expiry, l.code_enc, r.status report_status
                    FROM trades t JOIN listings l ON l.id = t.listing_id LEFT JOIN reports r ON r.trade_id = t.id
                    WHERE t.buyer_id = ? ORDER BY t.id DESC LIMIT 100`).all(user.id);
    return rows.map(({ code_enc, ...r }) => ({
      ...r, code: decrypt(code_enc),
      can_report: !r.report_status && now() - r.created_at <= RULES.REPORT_WINDOW,
    }));
  }

  // ---------- escrow settlement ----------
  // Seller earnings become spendable only after the 24h report window with no open report.
  function settleDue() {
    return tx(() => {
      const due = q(`SELECT t.* FROM trades t WHERE t.settled = 0 AND t.outcome = 'ok' AND t.created_at <= ?
                     AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.trade_id = t.id AND r.status = 'open') LIMIT 500`)
        .all(now() - RULES.REPORT_WINDOW);
      for (const t of due) {
        if (t.price > 0) {
          post(t.seller_id, 'sale_settled', -t.price, 'pending', t.listing_id);
          post(t.seller_id, 'sale_settled', t.price, 'balance', t.listing_id);
          q('UPDATE users SET earned = earned + ? WHERE id = ?').run(t.price, t.seller_id);
        }
        q('UPDATE trades SET settled = 1 WHERE id = ?').run(t.id);
      }
      return due.length;
    });
  }

  // ---------- reports ----------
  function reportTrade(user, tradeId, reason, details) {
    mustBeActive(user);
    if (!REPORT_REASONS.includes(reason)) fail(400, 'Pick a reason');
    const text = details ? cleanText(details, 'Details', 0, 500) : '';
    return tx(() => {
      const t = q('SELECT * FROM trades WHERE id = ? AND buyer_id = ?').get(tradeId, user.id);
      if (!t) fail(404, 'Purchase not found');
      if (now() - t.created_at > RULES.REPORT_WINDOW) fail(400, 'The 24-hour report window has closed');
      if (q('SELECT 1 FROM reports WHERE trade_id = ?').get(t.id)) fail(409, 'Already reported');
      q('INSERT INTO reports (trade_id, reason, details, created_at) VALUES (?,?,?,?)').run(t.id, reason, text, now());
      return { ok: true };
    });
  }

  // ---------- withdrawals (gift cards only, earned coins only) ----------
  function requestWithdrawal(user, amount) {
    mustBeActive(user);
    return tx(() => {
      settleDue();
      const u = getUser(user.id);
      const max = Math.min(u.balance, u.earned);
      cleanInt(amount, 'Amount', RULES.MIN_WITHDRAW, 100000);
      if (amount > max) fail(400, `You can redeem up to ${max} earned coins`);
      if (openReportsAgainst(u.id) > 0) fail(400, 'You have unresolved reports');
      q('UPDATE users SET earned = earned - ? WHERE id = ?').run(amount, u.id);
      const r = q('INSERT INTO withdrawals (user_id, amount, created_at) VALUES (?,?,?)').run(u.id, amount, now());
      post(u.id, 'withdrawal', -amount, 'balance', null, `wd:${r.lastInsertRowid}`);
      return { id: Number(r.lastInsertRowid) };
    });
  }

  function wallet(user) {
    if (!user) fail(401, 'Please sign in');
    settleDue();
    const u = getUser(user.id);
    return {
      balance: u.balance, pending: u.pending, locked: u.locked, redeemable: Math.min(u.balance, u.earned),
      ledger: q('SELECT id, type, amount, bucket, listing_id, status, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id),
      withdrawals: q('SELECT id, amount, status, voucher_enc, created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(u.id)
        .map(({ voucher_enc, ...w }) => ({ ...w, voucher: voucher_enc ? decrypt(voucher_enc) : null })),
    };
  }

  function profile(user) {
    if (!user) return null;
    const u = getUser(user.id);
    const t = trust(u.id);
    return {
      id: u.id, name: u.name, email: u.email, phone_verified: !!u.phone_verified_at, is_admin: !!u.is_admin,
      suspended: !!u.suspended, warnings: u.warnings, balance: u.balance, pending: u.pending, locked: u.locked,
      seller_status: u.seller_status, strikes: u.strikes, terminations: u.terminations,
      reapply_at: u.seller_status === 'terminated' ? u.terminated_at + RULES.REAPPLY_WAIT : null,
      good_sales: u.seller_status === 'active' ? goodSales(u) : 0, trust: t.percent, trades: t.trades,
    };
  }

  // ---------- admin ----------
  function mustBeAdmin(user) {
    if (!user || !user.is_admin || user.suspended) fail(403, 'Admins only');
  }
  const audit = (admin, action, target, detail = '') =>
    q('INSERT INTO audit (admin_id, action, target, detail, created_at) VALUES (?,?,?,?,?)').run(admin.id, action, String(target), detail, now());

  function adminQueue(admin) {
    mustBeAdmin(admin);
    settleDue();
    return {
      listings: q(`SELECT l.id, l.brand, l.category, l.discount, l.terms, l.expiry, l.price, l.code_enc, l.seller_id, u.name seller_name, u.strikes
                   FROM listings l JOIN users u ON u.id = l.seller_id WHERE l.status = 'pending' ORDER BY l.id LIMIT 50`).all()
        .map(({ code_enc, ...l }) => ({ ...l, code: decrypt(code_enc) })),
      reports: q(`SELECT r.id, r.reason, r.details, r.created_at, t.price, t.listing_id, t.buyer_id, t.seller_id, t.created_at bought_at,
                         l.brand, l.discount, l.expiry, l.code_enc, b.name buyer_name, b.warnings buyer_warnings, s.name seller_name, s.strikes seller_strikes
                  FROM reports r JOIN trades t ON t.id = r.trade_id JOIN listings l ON l.id = t.listing_id
                  JOIN users b ON b.id = t.buyer_id JOIN users s ON s.id = t.seller_id
                  WHERE r.status = 'open' ORDER BY r.id LIMIT 50`).all()
        .map(({ code_enc, ...r }) => ({ ...r, code: decrypt(code_enc) })),
      withdrawals: q(`SELECT w.id, w.amount, w.created_at, w.user_id, u.name, u.email FROM withdrawals w JOIN users u ON u.id = w.user_id
                      WHERE w.status = 'requested' ORDER BY w.id LIMIT 50`).all(),
      platform_coins: q('SELECT COALESCE(SUM(amount), 0) n FROM ledger WHERE user_id IS NULL').get().n,
      fee_revenue: q("SELECT COALESCE(SUM(amount), 0) n FROM ledger WHERE user_id IS NULL AND type IN ('fee','fee_reversal')").get().n,
    };
  }

  function screenshotPath(admin, listingId) {
    mustBeAdmin(admin);
    const l = q('SELECT screenshot_file FROM listings WHERE id = ?').get(listingId);
    if (!l || !/^[0-9a-f]{32}\.(png|jpg|webp)$/.test(l.screenshot_file)) fail(404, 'Not found');
    return path.join(shotDir, l.screenshot_file);
  }

  function reviewListing(admin, id, approve, reason) {
    mustBeAdmin(admin);
    return tx(() => {
      const l = q("SELECT * FROM listings WHERE id = ? AND status = 'pending'").get(id);
      if (!l) fail(404, 'Listing not found');
      if (l.seller_id === admin.id) fail(403, 'You cannot review your own listing');
      if (approve) {
        if (l.expiry < today()) fail(400, 'Coupon has expired');
        q("UPDATE listings SET status = 'live' WHERE id = ?").run(id);
      } else {
        q("UPDATE listings SET status = 'rejected', code_hash = NULL, reject_reason = ? WHERE id = ?").run(cleanText(reason || 'Not verified', 'Reason', 2, 200), id);
      }
      audit(admin, approve ? 'listing_approve' : 'listing_reject', `listing:${id}`);
      return { ok: true };
    });
  }

  function resolveReport(admin, id, outcome) {
    mustBeAdmin(admin);
    if (!['valid', 'rejected', 'abuse'].includes(outcome)) fail(400, 'Invalid outcome');
    return tx(() => {
      const r = q("SELECT * FROM reports WHERE id = ? AND status = 'open'").get(id);
      if (!r) fail(404, 'Report not found');
      const t = q('SELECT * FROM trades WHERE id = ?').get(r.trade_id);
      if (admin.id === t.buyer_id || admin.id === t.seller_id) fail(403, 'You cannot resolve a report you are part of');
      q('UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?').run(outcome, now(), admin.id, id);
      if (outcome === 'valid') {
        q("UPDATE trades SET outcome = 'refunded' WHERE id = ?").run(t.id);
        if (t.price > 0) {
          // Earnings are still in escrow (settlement is blocked while a report is open).
          post(t.seller_id, 'sale_reversal', -t.price, 'pending', t.listing_id);
          post(null, 'fee_reversal', -t.fee, 'platform', t.listing_id);
          post(t.buyer_id, 'refund', t.price + t.fee, 'balance', t.listing_id);
        }
        q('UPDATE users SET strikes = strikes + 1 WHERE id = ?').run(t.seller_id);
        if (getUser(t.seller_id).strikes >= RULES.STRIKES_TO_TERMINATE) terminateSeller(t.seller_id, '3 strikes');
      } else if (outcome === 'abuse') {
        q('UPDATE users SET warnings = warnings + 1 WHERE id = ?').run(t.buyer_id);
        if (getUser(t.buyer_id).warnings >= 2) q('UPDATE users SET suspended = 1 WHERE id = ?').run(t.buyer_id);
      }
      audit(admin, `report_${outcome}`, `report:${id}`);
      return { ok: true };
    });
  }

  function resolveWithdrawal(admin, id, fulfil, voucher) {
    mustBeAdmin(admin);
    return tx(() => {
      const w = q("SELECT * FROM withdrawals WHERE id = ? AND status = 'requested'").get(id);
      if (!w) fail(404, 'Request not found');
      if (w.user_id === admin.id) fail(403, 'You cannot approve your own withdrawal');
      if (fulfil) {
        const code = cleanText(voucher, 'Gift card code', 4, 200);
        q("UPDATE withdrawals SET status = 'fulfilled', voucher_enc = ?, resolved_at = ? WHERE id = ?").run(encrypt(code), now(), id);
      } else {
        q("UPDATE withdrawals SET status = 'rejected', resolved_at = ? WHERE id = ?").run(now(), id);
        post(w.user_id, 'withdrawal_reversal', w.amount, 'balance', null, `wd:${id}`);
        q('UPDATE users SET earned = earned + ? WHERE id = ?').run(w.amount, w.user_id);
      }
      audit(admin, fulfil ? 'withdrawal_fulfil' : 'withdrawal_reject', `withdrawal:${id}`);
      return { ok: true };
    });
  }

  // Fraud (coupon not owned / already used): immediate termination, deposit forfeited.
  function adminTerminate(admin, userId, reason) {
    mustBeAdmin(admin);
    return tx(() => {
      const u = getUser(userId);
      if (!u || u.seller_status !== 'active') fail(404, 'Active seller not found');
      if (u.id === admin.id) fail(403, 'Not on yourself');
      const why = cleanText(reason, 'Reason', 5, 200);
      terminateSeller(u.id, why);
      audit(admin, 'seller_terminate', `user:${u.id}`, why);
      return { ok: true };
    });
  }

  return {
    db, RULES, CATEGORIES,
    upsertGoogleUser, createSession, sessionUser, destroySession, profile,
    startPhone, verifyPhone: verifyPhoneChecked,
    createTopup, confirmTopup, wallet, requestWithdrawal,
    activateSeller, releaseDeposit, trust,
    createListing, browse, myListings, removeListing,
    buy, startClaim, finishClaim, myPurchases, reportTrade, settleDue,
    adminQueue, screenshotPath, reviewListing, resolveReport, resolveWithdrawal, adminTerminate,
  };
}

module.exports = { createCore, AppError, RULES, CATEGORIES };
