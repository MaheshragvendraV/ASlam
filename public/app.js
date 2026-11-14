'use strict';
// CouponShop front end. All user data is rendered with textContent (never innerHTML).

const $main = document.getElementById('main');
const $nav = document.getElementById('nav');
const $coins = document.getElementById('coins');
const $logout = document.getElementById('logout');
const $toast = document.getElementById('toast');
let me = null, cfg = null, tab = 'browse', timer = null;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $toast.hidden = true; }, 4000);
}

async function api(path, body) {
  const opt = body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF': '1' }, body: JSON.stringify(body),
  };
  const r = await fetch(path, { credentials: 'same-origin', ...opt });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Run an action; show errors as a toast.
const act = (fn) => async (ev) => {
  if (ev) ev.preventDefault();
  const btn = ev && (ev.submitter || ev.currentTarget);
  if (btn && btn.tagName === 'BUTTON') btn.disabled = true;
  try { await fn(ev); } catch (e) { toast(e.message); } finally { if (btn && btn.tagName === 'BUTTON') btn.disabled = false; }
};

const coins = (n) => `${n} coin${n === 1 ? '' : 's'}`;
const when = (ms) => new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const trustTag = (s) => h('span', { class: 'tag' }, s.trust == null ? 'New seller' : `${s.trust}% trust · ${s.trades} trades`);

async function refresh() {
  const r = await api('/api/me');
  me = r.user; cfg = r.config;
  $logout.hidden = !me;
  $coins.hidden = !(me && me.phone_verified);
  if (me) $coins.textContent = `🪙 ${me.balance}`;
}

async function render() {
  clearInterval(timer);
  await refresh();
  if (!me) { $nav.hidden = true; return viewSignIn(); }
  if (!me.phone_verified) { $nav.hidden = true; return viewPhone(); }
  const tabs = [['browse', 'Browse'], ['mine', 'My coupons'], ['sell', 'Sell'], ['wallet', 'Wallet'], ['rules', 'Rules']];
  if (me.is_admin) tabs.push(['admin', 'Admin']);
  $nav.hidden = false;
  $nav.replaceChildren(...tabs.map(([id, label]) =>
    h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; render().catch((e) => toast(e.message)); } }, label)));
  const views = { browse: viewBrowse, mine: viewMine, sell: viewSell, wallet: viewWallet, rules: viewRules, admin: viewAdmin };
  if (me.suspended) $main.replaceChildren(h('div', { class: 'card' }, 'Your account is suspended for repeated false reports.'));
  else await views[tab]();
}
const show = (...nodes) => $main.replaceChildren(...nodes.flat(Infinity).filter((n) => n != null && n !== false));

// ---------- sign in ----------
function viewSignIn() {
  const box = h('div', { class: 'card narrow' }, h('h1', {}, 'Buy and sell unused coupons'),
    h('p', { class: 'muted' }, 'Sign in with Google, verify your phone, and you are ready.'));
  if (cfg.google_client_id) {
    const holder = h('div', {});
    box.append(holder);
    const s = h('script', { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = () => {
      window.google.accounts.id.initialize({
        client_id: cfg.google_client_id,
        callback: (resp) => act(async () => { await api('/api/auth/google', { credential: resp.credential }); await render(); })(),
      });
      window.google.accounts.id.renderButton(holder, { theme: 'outline', size: 'large' });
    };
    document.head.append(s);
  }
  if (cfg.dev) {
    const email = h('input', { type: 'email', required: true, placeholder: 'you@example.com', id: 'dev-email' });
    box.append(h('form', { onsubmit: act(async () => { await api('/api/auth/dev', { email: email.value }); await render(); }) },
      h('label', { for: 'dev-email' }, 'Dev mode sign-in (no Google needed)'), email,
      h('div', { class: 'row' }, h('button', { class: 'primary' }, 'Sign in'))));
  }
  show(box);
}

function viewPhone() {
  const phone = h('input', { id: 'phone', inputmode: 'numeric', pattern: '[6-9][0-9]{9}', maxlength: 10, required: true, placeholder: '10-digit mobile number' });
  const age = h('input', { type: 'checkbox', id: 'age', required: true });
  const code = h('input', { id: 'otp', inputmode: 'numeric', pattern: '[0-9]{6}', maxlength: 6, required: true, autocomplete: 'one-time-code' });
  const step2 = h('form', { hidden: true, onsubmit: act(async () => { await api('/api/phone/verify', { code: code.value }); toast('Phone verified'); await render(); }) },
    h('label', { for: 'otp' }, 'Enter the 6-digit code'), code,
    h('div', { class: 'row' }, h('button', { class: 'primary' }, 'Verify')));
  const step1 = h('form', { onsubmit: act(async () => {
    const r = await api('/api/phone/start', { phone: phone.value, age18: age.checked });
    step2.hidden = false;
    if (r.dev_code) { code.value = r.dev_code; toast(`Dev mode: your code is ${r.dev_code}`); } else toast('Code sent by SMS');
  }) },
    h('label', { for: 'phone' }, 'Mobile number (+91)'), phone,
    h('label', { for: 'age' }, age, 'I am 18 or older'),
    h('div', { class: 'row' }, h('button', { class: 'primary' }, 'Send code')));
  show(h('div', { class: 'card narrow' }, h('h1', {}, 'Verify your phone'),
    h('p', { class: 'muted' }, 'One phone number per account. Required before you can buy or sell.'), step1, step2));
}

// ---------- browse ----------
async function viewBrowse() {
  const q = h('input', { type: 'search', placeholder: 'Search brand or offer', 'aria-label': 'Search' });
  const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'), cfg.categories.map((c) => h('option', {}, c)));
  const grid = h('div', { class: 'grid' });
  const load = act(async () => {
    const items = await api(`/api/listings?q=${encodeURIComponent(q.value)}&category=${encodeURIComponent(cat.value)}`);
    grid.replaceChildren(...items.map(listingCard));
    if (!items.length) grid.replaceChildren(h('p', { class: 'muted' }, 'No coupons found.'));
  });
  q.addEventListener('input', () => { clearTimeout(q.t); q.t = setTimeout(load, 300); });
  cat.addEventListener('change', load);
  show(h('div', { class: 'row nowrap mb12' }, q, cat), grid);
  await load();
}

function listingCard(l) {
  const price = l.free
    ? h('div', {}, h('span', { class: 'big' }, 'Free'), h('span', { class: 'muted' }, ' · watch a short ad'))
    : h('div', {}, h('span', { class: 'big' }, coins(l.total)), h('div', { class: 'muted' }, `Seller ${l.seller_price} + ${l.fee} platform fee`));
  const btn = l.free
    ? h('button', { class: 'primary', onclick: act(() => claimFlow(l)) }, 'Watch ad & get code')
    : h('button', { class: 'primary', onclick: act(async () => {
      if (!confirm(`Buy this ${l.brand} coupon for ${coins(l.total)}? The code is shown right away and the sale is final.`)) return;
      showCode(l, await api(`/api/listings/${l.id}/buy`, {}));
    }) }, `Buy for ${l.total}`);
  return h('div', { class: 'card' },
    h('div', { class: 'row spread' }, h('strong', {}, l.brand), h('span', { class: 'tag' }, l.category)),
    h('div', {}, l.discount), l.terms && h('div', { class: 'muted' }, l.terms),
    h('div', { class: 'muted' }, `Expires ${l.expiry} · ${l.seller.name} `, trustTag(l.seller)),
    price, btn);
}

async function claimFlow(l) {
  const r = await api(`/api/listings/${l.id}/claim/start`, {});
  let left = r.wait_seconds;
  const count = h('p', { class: 'big' }, `${left}s`);
  // Ad slot: plug your ad network's rewarded-ad unit in here.
  show(h('div', { class: 'ad' }, h('p', {}, 'Advertisement'), h('p', { class: 'muted' }, 'Your free coupon unlocks when the ad ends.'), count));
  timer = setInterval(async () => {
    left -= 1;
    count.textContent = `${Math.max(left, 0)}s`;
    if (left > -1) return;
    clearInterval(timer);
    try { showCode(l, await api(`/api/listings/${l.id}/claim/finish`, {})); } catch (e) { toast(e.message); render(); }
  }, 1000);
}

function showCode(l, r) {
  refresh();
  show(h('div', { class: 'card narrow' }, h('h1', {}, `${l.brand} — ${l.discount}`),
    h('p', { class: 'code' }, r.code),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => navigator.clipboard.writeText(r.code).then(() => toast('Copied')) }, 'Copy code'),
      h('button', { onclick: () => { tab = 'mine'; render(); } }, 'My coupons')),
    h('p', { class: 'muted' }, `${r.paid ? `You paid ${coins(r.paid)}. ` : ''}If the code does not work, report it within 24 hours from “My coupons”. For personal use only — bought coupons cannot be resold.`)));
}

// ---------- my coupons ----------
async function viewMine() {
  const items = await api('/api/my/purchases');
  const reasons = { invalid: 'Invalid / already used', expired: 'Expired when sold', mismatch: 'Not the listed brand/value' };
  const status = { open: ['Report under review', 'warn'], valid: ['Refunded', ''], rejected: ['Report rejected', 'bad'], abuse: ['Report rejected (false report)', 'bad'] };
  show(h('h1', {}, 'My coupons'), ...items.map((t) => {
    const card = h('div', { class: 'card' },
      h('div', { class: 'row spread' }, h('strong', {}, `${t.brand} — ${t.discount}`), h('span', { class: 'muted' }, t.price ? coins(t.price + t.fee) : 'Free')),
      h('p', { class: 'code' }, t.code), t.terms && h('div', { class: 'muted' }, t.terms),
      h('div', { class: 'muted' }, `Expires ${t.expiry} · got ${when(t.created_at)}`));
    if (t.report_status) card.append(h('span', { class: `tag ${status[t.report_status][1]}` }, status[t.report_status][0]));
    else if (t.can_report) {
      const sel = h('select', { 'aria-label': 'Problem' }, Object.entries(reasons).map(([v, label]) => h('option', { value: v }, label)));
      const det = h('input', { placeholder: 'What happened? (optional)', maxlength: 500, 'aria-label': 'Details' });
      const form = h('form', { hidden: true, onsubmit: act(async () => {
        await api(`/api/trades/${t.id}/report`, { reason: sel.value, details: det.value });
        toast('Report sent for review'); await render();
      }) }, sel, det, h('div', { class: 'row' }, h('button', { class: 'danger' }, 'Send report')),
      h('p', { class: 'muted' }, 'False reports lead to a warning, then suspension.'));
      card.append(h('button', { class: 'link', onclick: () => { form.hidden = !form.hidden; } }, 'Report a problem'), form);
    }
    return card;
  }), !items.length && h('p', { class: 'muted' }, 'Nothing here yet.'));
}

// ---------- sell ----------
async function viewSell() {
  const R = cfg.rules;
  if (me.seller_status !== 'active') {
    const box = h('div', { class: 'card narrow' }, h('h1', {}, 'Become a seller'));
    if (me.seller_status === 'banned') box.append(h('p', {}, 'Your seller access has been permanently removed. You can still buy.'));
    else {
      const re = me.seller_status === 'terminated';
      const waiting = re && Date.now() < me.reapply_at;
      box.append(
        h('p', {}, re
          ? `Your seller access was terminated. You can reapply ${waiting ? 'on ' + new Date(me.reapply_at).toLocaleDateString('en-IN') : 'now'} for a ${R.REAPPLY_FEE}-coin fee plus a new ${R.DEPOSIT}-coin deposit.`
          : `A ${R.DEPOSIT}-coin security deposit is locked from your wallet. You get it back after ${R.GOOD_SALES_FOR_DEPOSIT} good sales. It is forfeited after ${R.STRIKES_TO_TERMINATE} strikes.`),
        h('button', { class: 'primary', disabled: waiting, onclick: act(async () => { await api('/api/seller/activate', {}); toast('You are now a seller'); await render(); }) },
          re ? `Reapply (${R.REAPPLY_FEE + R.DEPOSIT} coins)` : `Lock ${R.DEPOSIT} coins & start selling`),
        h('p', { class: 'muted' }, `Wallet: ${coins(me.balance)}`));
    }
    return show(box);
  }

  const f = {
    brand: h('input', { id: 'f-brand', required: true, minlength: 2, maxlength: 40 }),
    category: h('select', { id: 'f-cat' }, cfg.categories.map((c) => h('option', {}, c))),
    discount: h('input', { id: 'f-disc', required: true, minlength: 2, maxlength: 60, placeholder: 'e.g. ₹150 off or 20% off' }),
    terms: h('input', { id: 'f-terms', maxlength: 200, placeholder: 'Min. order, one-time use, etc.' }),
    expiry: h('input', { id: 'f-exp', type: 'date', required: true }),
    code: h('input', { id: 'f-code', required: true, minlength: 3, maxlength: 100, autocomplete: 'off' }),
    price: h('input', { id: 'f-price', type: 'number', min: 0, max: R.MAX_PRICE, step: 1, required: true, value: 10 }),
    shot: h('input', { id: 'f-shot', type: 'file', accept: 'image/png,image/jpeg,image/webp', required: true }),
  };
  const preview = h('p', { class: 'muted' });
  const upd = () => {
    const p = Number(f.price.value);
    preview.textContent = p === 0 ? 'Free giveaway: buyers watch an ad, you earn nothing.'
      : `You receive ${p}. Buyer pays ${p + R.FEE} (${p} + ${R.FEE} platform fee).`;
  };
  f.price.addEventListener('input', upd); upd();
  const lab = (id, text) => h('label', { for: id }, text);
  const form = h('form', { class: 'card', onsubmit: act(async () => {
    const file = f.shot.files[0];
    if (file.size > R.MAX_SCREENSHOT_BYTES) throw new Error('Screenshot must be under 2 MB');
    const b64 = await new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = bad; r.readAsDataURL(file); });
    await api('/api/listings', { brand: f.brand.value, category: f.category.value, discount: f.discount.value, terms: f.terms.value,
      expiry: f.expiry.value, code: f.code.value, price: Number(f.price.value), screenshot: b64 });
    toast('Submitted for verification'); await render();
  }) },
    h('h2', { class: 'mt0' }, 'List a coupon'),
    lab('f-brand', 'Brand'), f.brand, lab('f-cat', 'Category'), f.category, lab('f-disc', 'Discount'), f.discount,
    lab('f-terms', 'Usage terms'), f.terms, lab('f-exp', 'Expiry date'), f.expiry,
    lab('f-code', 'Coupon code (stored encrypted, shown only to the buyer)'), f.code,
    lab('f-price', `Your price in coins (1–${R.MAX_PRICE}, or 0 to give away free)`), f.price, preview,
    lab('f-shot', 'Screenshot of the coupon (private — only reviewers see it)'), f.shot,
    h('div', { class: 'row' }, h('button', { class: 'primary' }, 'Submit for verification')));

  const mine = await api('/api/my/listings');
  const canRelease = me.good_sales >= R.GOOD_SALES_FOR_DEPOSIT;
  show(
    h('div', { class: 'card' }, h('div', { class: 'row spread' },
      h('div', {}, h('strong', {}, 'Seller status'), ' ', trustTag(me), ' ',
        h('span', { class: `tag ${me.strikes ? 'bad' : ''}` }, `${me.strikes}/${R.STRIKES_TO_TERMINATE} strikes`)),
      h('button', { disabled: !canRelease, onclick: act(async () => {
        if (!confirm('Release your deposit? This ends your seller status and removes your active listings.')) return;
        await api('/api/seller/release-deposit', {}); toast('Deposit released to your wallet'); await render();
      }) }, 'Release deposit')),
    h('p', { class: 'muted' }, `Deposit ${coins(me.locked)} locked · ${me.good_sales}/${R.GOOD_SALES_FOR_DEPOSIT} good sales · ${coins(me.pending)} clearing (24h hold)`)),
    form,
    h('h2', {}, 'Your listings'),
    mine.length ? h('div', { class: 'card scroll' }, h('table', {},
      h('tr', {}, ['Coupon', 'Expiry', 'Price', 'Status', ''].map((t) => h('th', {}, t))),
      mine.map((l) => h('tr', {},
        h('td', {}, `${l.brand} — ${l.discount}`), h('td', {}, l.expiry), h('td', {}, l.price ? String(l.price) : 'Free'),
        h('td', {}, l.status === 'rejected' ? `rejected: ${l.reject_reason}` : l.status === 'pending' ? 'in review' : l.status),
        h('td', {}, ['pending', 'live'].includes(l.status) && h('button', { class: 'link', onclick: act(async () => { await api(`/api/listings/${l.id}/remove`, {}); await render(); }) }, 'Remove'))))))
      : h('p', { class: 'muted' }, 'No listings yet.'));
}

// ---------- wallet ----------
async function viewWallet() {
  const R = cfg.rules;
  const w = await api('/api/wallet');
  const amt = h('input', { id: 'topup', type: 'number', min: R.TOPUP_MIN, max: R.TOPUP_MAX, step: 1, value: 100, required: true });
  const topup = h('form', { class: 'card', onsubmit: act(async () => {
    const o = await api('/api/topup', { amount: Number(amt.value) });
    if (cfg.dev) { await api('/api/dev/pay', { order_id: o.order_id }); toast(`Dev mode: added ${coins(o.amount)}`); await render(); }
    else toast(`Order ${o.order_id} created. Complete the UPI payment; coins appear once it is confirmed.`);
  }) }, h('h2', { class: 'mt0' }, 'Top up with UPI'), h('label', { for: 'topup' }, `Amount in ₹ (1 coin = ₹1, ${R.TOPUP_MIN}–${R.TOPUP_MAX})`), amt,
  h('div', { class: 'row' }, h('button', { class: 'primary' }, cfg.dev ? 'Add coins (simulated payment)' : 'Pay with UPI')));

  const wamt = h('input', { id: 'wd', type: 'number', min: R.MIN_WITHDRAW, step: 1, value: Math.max(R.MIN_WITHDRAW, w.redeemable), required: true });
  const redeem = h('form', { class: 'card', onsubmit: act(async () => { await api('/api/withdrawals', { amount: Number(wamt.value) }); toast('Gift card requested'); await render(); }) },
    h('h2', { class: 'mt0' }, 'Redeem earnings as a gift card'),
    h('p', { class: 'muted' }, `Redeemable: ${coins(w.redeemable)}. Minimum ${R.MIN_WITHDRAW}. Only coins earned from sales can be redeemed — no cash or bank transfers.`),
    h('label', { for: 'wd' }, 'Coins to redeem'), wamt,
    h('div', { class: 'row' }, h('button', { class: 'primary', disabled: w.redeemable < R.MIN_WITHDRAW }, 'Request gift card')));

  const names = { topup: 'Top-up', purchase: 'Purchase', sale: 'Sale (clearing)', sale_settled: 'Sale cleared', sale_reversal: 'Sale reversed', refund: 'Refund',
    free_claim: 'Free coupon', deposit_lock: 'Seller deposit', deposit_release: 'Deposit released', deposit_forfeit: 'Deposit forfeited',
    reapply_fee: 'Reapplication fee', withdrawal: 'Gift card request', withdrawal_reversal: 'Gift card request returned' };
  show(
    h('div', { class: 'grid mb12' },
      h('div', { class: 'card' }, h('span', { class: 'muted' }, 'Spendable'), h('span', { class: 'big' }, coins(w.balance))),
      h('div', { class: 'card' }, h('span', { class: 'muted' }, 'Clearing (24h hold)'), h('span', { class: 'big' }, coins(w.pending))),
      h('div', { class: 'card' }, h('span', { class: 'muted' }, 'Locked deposit'), h('span', { class: 'big' }, coins(w.locked)))),
    topup, redeem,
    w.withdrawals.length ? h('div', { class: 'card' }, h('h2', { class: 'mt0' }, 'Gift card requests'),
      w.withdrawals.map((x) => h('div', { class: 'row spread' }, h('span', {}, `${coins(x.amount)} · ${when(x.created_at)}`),
        x.voucher ? h('span', { class: 'code' }, x.voucher) : h('span', { class: 'tag' }, x.status)))) : null,
    h('h2', {}, 'History'),
    h('div', { class: 'card scroll' }, w.ledger.length ? h('table', {},
      h('tr', {}, h('th', {}, 'When'), h('th', {}, 'What'), h('th', { class: 'num' }, 'Coins')),
      w.ledger.map((e) => h('tr', {}, h('td', {}, when(e.created_at)),
        h('td', {}, (names[e.type] || e.type) + (e.bucket !== 'balance' && e.bucket !== 'none' ? ` (${e.bucket})` : '') + (e.listing_id ? ` #${e.listing_id}` : '')),
        h('td', { class: 'num' }, (e.amount > 0 ? '+' : '') + e.amount)))) : h('p', { class: 'muted' }, 'No transactions yet.')));
}

// ---------- rules ----------
function viewRules() {
  const R = cfg.rules;
  const li = (t) => h('li', {}, t);
  show(h('h1', {}, 'Rules'), h('div', { class: 'card' }, h('ol', { class: 'rules' },
    li('Sign in with Google and verify your phone. One phone number, one account. You must be 18+.'),
    li(`Top up with UPI. 1 coin = ₹1. Wallet limit ${R.MAX_BALANCE} coins.`),
    li(`Sellers price coupons at 1–${R.MAX_PRICE} coins, or give them away free. Buyers pay the seller price + ${R.FEE} coin platform fee.`),
    li('The code is shown the moment you buy. Sales are final — but if the code is invalid, expired or not as listed, report it within 24 hours for a full refund.'),
    li('Free coupons unlock after a short ad.'),
    li(`To sell, lock a ${R.DEPOSIT}-coin deposit. Every listing needs a screenshot and is reviewed before going live.`),
    li('Seller earnings are held for 24 hours, then become spendable and redeemable.'),
    li(`Earnings can be redeemed as gift cards from ${R.MIN_WITHDRAW} coins. No cash. Topped-up coins can only be spent, not redeemed.`),
    li(`Each confirmed bad coupon (paid or free) is a strike. ${R.STRIKES_TO_TERMINATE} strikes: seller access ends and the deposit is forfeited. Listing coupons you do not own ends it immediately.`),
    li(`Terminated sellers can reapply after 90 days for ${R.REAPPLY_FEE} coins plus a new deposit. A third termination is permanent.`),
    li(`The deposit is returned after ${R.GOOD_SALES_FOR_DEPOSIT} good sales with no open reports.`),
    li(`Trust % = good trades ÷ all trades. Shown after ${R.TRUST_MIN_TRADES} trades.`),
    li('False reports: first a warning, then suspension. Bought coupons are for personal use and cannot be relisted.'))));
}

// ---------- admin ----------
async function viewAdmin() {
  const a = await api('/api/admin/queue');
  const post = (path, body, msg) => act(async () => { await api(path, body); toast(msg); await render(); });
  show(
    h('h1', {}, 'Admin'),
    h('p', { class: 'muted' }, `Platform coins: ${a.platform_coins} · of which sale fees: ${a.fee_revenue}`),
    h('h2', {}, `Listings to verify (${a.listings.length})`),
    a.listings.map((l) => h('div', { class: 'card' },
      h('strong', {}, `${l.brand} — ${l.discount}`), h('div', { class: 'muted' }, `${l.category} · expires ${l.expiry} · ${l.price ? coins(l.price) : 'Free'} · ${l.seller_name} (${l.strikes} strikes)`),
      l.terms && h('div', { class: 'muted' }, l.terms), h('p', { class: 'code' }, l.code),
      h('img', { class: 'shot', src: `/api/admin/screenshot/${l.id}`, alt: 'Seller screenshot', loading: 'lazy' }),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: post(`/api/admin/listings/${l.id}/review`, { approve: true }, 'Approved') }, 'Approve'),
        h('button', { class: 'danger', onclick: act(async () => {
          const reason = prompt('Reason for rejection?', 'Screenshot does not match the code');
          if (!reason) return;
          await api(`/api/admin/listings/${l.id}/review`, { approve: false, reason }); await render();
        }) }, 'Reject'),
        h('button', { class: 'danger', onclick: act(async () => {
          const reason = prompt('Terminate this seller for fraud (deposit forfeited). Reason?');
          if (!reason) return;
          await api(`/api/admin/users/${l.seller_id}/terminate`, { reason }); await render();
        }) }, 'Terminate seller'))) ),
    h('h2', {}, `Open reports (${a.reports.length})`),
    a.reports.map((r) => h('div', { class: 'card' },
      h('strong', {}, `${r.brand} — ${r.discount}`), ' ', h('span', { class: 'tag warn' }, r.reason),
      h('div', { class: 'muted' }, `Bought ${when(r.bought_at)} for ${r.price ? r.price + 1 : 0} · expires ${r.expiry}`),
      h('div', { class: 'muted' }, `Buyer ${r.buyer_name} (${r.buyer_warnings} warnings) · Seller ${r.seller_name} (${r.seller_strikes} strikes)`),
      r.details && h('p', {}, `“${r.details}”`), h('p', { class: 'code' }, r.code),
      h('img', { class: 'shot', src: `/api/admin/screenshot/${r.listing_id}`, alt: 'Seller screenshot', loading: 'lazy' }),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: post(`/api/admin/reports/${r.id}/resolve`, { outcome: 'valid' }, 'Refunded, strike added') }, 'Valid: refund + strike'),
        h('button', { onclick: post(`/api/admin/reports/${r.id}/resolve`, { outcome: 'rejected' }, 'Rejected') }, 'Reject'),
        h('button', { class: 'danger', onclick: post(`/api/admin/reports/${r.id}/resolve`, { outcome: 'abuse' }, 'Marked as false report') }, 'False report')))),
    h('h2', {}, `Gift card requests (${a.withdrawals.length})`),
    a.withdrawals.map((w) => {
      const v = h('input', { placeholder: 'Gift card code', 'aria-label': 'Gift card code', autocomplete: 'off' });
      return h('div', { class: 'card' }, h('strong', {}, `₹${w.amount} gift card`), h('div', { class: 'muted' }, `${w.name} · ${w.email} · ${when(w.created_at)}`), v,
        h('div', { class: 'row mt8' },
          h('button', { class: 'primary', onclick: act(async () => { await api(`/api/admin/withdrawals/${w.id}/resolve`, { fulfil: true, voucher: v.value }); toast('Sent'); await render(); }) }, 'Send gift card'),
          h('button', { class: 'danger', onclick: post(`/api/admin/withdrawals/${w.id}/resolve`, { fulfil: false }, 'Returned coins') }, 'Reject & return coins')));
    }));
}

$logout.addEventListener('click', act(async () => { await api('/api/auth/logout', {}); tab = 'browse'; await render(); }));
render().catch((e) => { $main.textContent = e.message; });
