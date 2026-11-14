'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCore } = require('../lib/core');

const HOUR = 3600e3, DAY = 24 * HOUR;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString('base64');

function setup() {
  const clock = { t: Date.UTC(2026, 0, 10), now() { return this.t; } };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-'));
  const core = createCore({ dataDir, secret: 'x'.repeat(40), clock });
  let n = 0;
  const mk = (name, admin = false) => {
    n += 1;
    let u = core.upsertGoogleUser({ sub: 's' + n, email: `${name}@t.io`, name }, admin ? [`${name}@t.io`] : []);
    const code = core.startPhone(u, '9' + String(n).padStart(9, '0'), true);
    core.verifyPhone(u, code);
    return () => core.sessionUser(core.createSession(u.id));
  };
  const fund = (u, amount) => { const o = core.createTopup(u(), amount); core.confirmTopup(o.order_id, 'pay_' + o.order_id, amount); };
  let c = 0;
  const list = (seller, admin, price = 10) => {
    c += 1;
    const { id } = core.createListing(seller(), { brand: 'Zomato', category: 'Food', discount: '100 off', expiry: '2027-01-01', code: 'CODE' + c, price, screenshot: PNG });
    core.reviewListing(admin(), id, true);
    return id;
  };
  const bucketsMatchLedger = () => {
    for (const u of core.db.prepare('SELECT * FROM users').all()) {
      for (const b of ['balance', 'pending', 'locked']) {
        const sum = core.db.prepare('SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE user_id = ? AND bucket = ?').get(u.id, b).n;
        assert.equal(u[b], sum, `${u.name}.${b}`);
      }
    }
  };
  return { core, clock, mk, fund, list, bucketsMatchLedger };
}

test('purchase: buyer pays price + fee, seller earnings are escrowed 24h, fee is its own line', () => {
  const { core, clock, mk, fund, list, bucketsMatchLedger } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  assert.equal(buyer().balance, 0);
  fund(seller, 100); fund(buyer, 50);
  core.activateSeller(seller());
  assert.equal(seller().balance, 0); assert.equal(seller().locked, 100);
  const id = list(seller, admin, 25);
  assert.equal(core.browse()[0].total, 26);
  const r = core.buy(buyer(), id);
  assert.equal(r.code, 'CODE1'); assert.equal(r.paid, 26);
  assert.equal(buyer().balance, 24);
  assert.equal(seller().pending, 25); assert.equal(seller().balance, 0);
  assert.equal(core.db.prepare("SELECT SUM(amount) n FROM ledger WHERE user_id IS NULL AND type = 'fee'").get().n, 1);
  assert.throws(() => core.buy(buyer(), id), /no longer available/);
  clock.t += DAY + 1;
  core.settleDue();
  assert.equal(seller().pending, 0); assert.equal(seller().balance, 25);
  bucketsMatchLedger();
});

test('guards: no overdraft, no self-buy, no duplicate code, no duplicate phone, bad image rejected', () => {
  const { core, mk, fund, list } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  assert.throws(() => core.activateSeller(seller()), /Not enough coins/);
  fund(seller, 150); core.activateSeller(seller());
  const id = list(seller, admin, 10);
  assert.throws(() => core.buy(buyer(), id), /Not enough coins/);
  assert.equal(core.browse().length, 1, 'failed purchase must not consume the listing');
  assert.throws(() => core.buy(seller(), id), /your own/);
  const base = { brand: 'Zomato', category: 'Food', discount: '100 off', expiry: '2027-01-01', price: 5, screenshot: PNG };
  assert.throws(() => core.createListing(seller(), { ...base, code: 'code 1' }), /already been listed/);
  assert.throws(() => core.createListing(seller(), { ...base, code: 'NEW', price: 26 }), /Price/);
  assert.throws(() => core.createListing(seller(), { ...base, code: 'NEW', expiry: '2026-01-10' }), /valid for/);
  assert.throws(() => core.createListing(seller(), { ...base, code: 'NEW', screenshot: Buffer.from('<script>').toString('base64') }), /PNG/);
  assert.throws(() => core.createListing(buyer(), { ...base, code: 'NEW' }), /Become a seller/);
  const u = core.upsertGoogleUser({ sub: 'dup', email: 'dup@t.io', name: 'dup' });
  assert.throws(() => core.startPhone(u, '9000000001', true), /already linked/);
  assert.throws(() => core.startPhone(u, '9111111111', false), /18/);
  assert.throws(() => core.db.exec('UPDATE ledger SET amount = 999'), /append-only/);
  assert.throws(() => core.db.exec('DELETE FROM ledger'), /append-only/);
});

test('OTP: wrong codes are counted and locked out', () => {
  const { core } = setup();
  const u = core.upsertGoogleUser({ sub: 'o', email: 'o@t.io', name: 'o' });
  const code = core.startPhone(u, '9222222222', true);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.throws(() => core.verifyPhone(u, wrong), /Wrong code/);
  assert.throws(() => core.verifyPhone(u, code), /Too many/);
});

test('valid report refunds buyer in full, 3 strikes terminate and forfeit deposit; 3rd termination is permanent', () => {
  const { core, clock, mk, fund, list, bucketsMatchLedger } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  fund(seller, 1000); fund(buyer, 1000);
  const strikeOut = () => {
    for (let i = 0; i < 3; i++) {
      const { trade_id } = core.buy(buyer(), list(seller, admin, 10));
      core.reportTrade(buyer(), trade_id, 'invalid', '');
      clock.t += 2 * DAY; core.settleDue();           // open report blocks settlement
      assert.equal(seller().balance + seller().pending >= 10, true);
      const rep = core.db.prepare("SELECT id FROM reports WHERE status = 'open'").get();
      core.resolveReport(admin(), rep.id, 'valid');
    }
  };
  core.activateSeller(seller());
  const live = list(seller, admin, 5);
  strikeOut();
  assert.equal(buyer().balance, 1000, 'buyer fully refunded incl. fee');
  assert.equal(seller().seller_status, 'terminated');
  assert.equal(seller().locked, 0); assert.equal(seller().pending, 0);
  assert.equal(core.browse().length, 0, 'live listings removed on termination');
  assert.equal(core.db.prepare('SELECT status FROM listings WHERE id = ?').get(live).status, 'removed');
  assert.throws(() => core.activateSeller(seller()), /reapply in/);
  clock.t += 91 * DAY;
  const before = seller().balance;
  core.activateSeller(seller());
  assert.equal(seller().balance, before - 150); assert.equal(seller().strikes, 0);
  strikeOut(); clock.t += 91 * DAY; core.activateSeller(seller());
  strikeOut();
  assert.equal(seller().seller_status, 'banned');
  clock.t += 365 * DAY;
  assert.throws(() => core.activateSeller(seller()), /permanently/);
  bucketsMatchLedger();
});

test('report window, false reports -> warning then suspension', () => {
  const { core, clock, mk, fund, list } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  fund(seller, 100); fund(buyer, 100); core.activateSeller(seller());
  const late = core.buy(buyer(), list(seller, admin)).trade_id;
  clock.t += DAY + 1;
  assert.throws(() => core.reportTrade(buyer(), late, 'invalid', ''), /window/);
  for (let i = 0; i < 2; i++) {
    const { trade_id } = core.buy(buyer(), list(seller, admin));
    core.reportTrade(buyer(), trade_id, 'expired', 'x');
    assert.throws(() => core.reportTrade(buyer(), trade_id, 'expired', 'x'), /Already/);
    core.resolveReport(admin(), core.db.prepare("SELECT id FROM reports WHERE status = 'open'").get().id, 'abuse');
  }
  assert.equal(buyer().warnings, 2); assert.equal(buyer().suspended, 1);
  assert.throws(() => core.buy(buyer(), list(seller, admin)), /suspended/);
  assert.equal(seller().strikes, 0);
});

test('free giveaway: ad wait enforced, no coins move, claim logged, strikes apply', () => {
  const { core, clock, mk, fund, list } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  fund(seller, 100); core.activateSeller(seller());
  const id = list(seller, admin, 0);
  assert.throws(() => core.buy(buyer(), id), /Wrong action/);
  assert.throws(() => core.finishClaim(buyer(), id), /full ad/);
  core.startClaim(buyer(), id);
  clock.t += 5000;
  assert.throws(() => core.finishClaim(buyer(), id), /full ad/);
  clock.t += 11000;
  const r = core.finishClaim(buyer(), id);
  assert.equal(r.paid, 0); assert.equal(buyer().balance, 0);
  assert.equal(core.db.prepare("SELECT COUNT(*) n FROM ledger WHERE type = 'free_claim'").get().n, 1);
  core.reportTrade(buyer(), r.trade_id, 'expired', '');
  core.resolveReport(admin(), 1, 'valid');
  assert.equal(seller().strikes, 1);
});

test('withdrawals: only earned coins, min 200; deposit release after 10 good sales; trust score', () => {
  const { core, clock, mk, fund, list, bucketsMatchLedger } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  fund(seller, 600); fund(buyer, 600); core.activateSeller(seller());
  assert.throws(() => core.requestWithdrawal(seller(), 200), /up to 0 earned/);   // topped-up coins are not redeemable
  assert.throws(() => core.releaseDeposit(seller()), /10 confirmed/);
  for (let i = 0; i < 4; i++) core.buy(buyer(), list(seller, admin, 25));
  assert.equal(core.trust(seller().id).percent, null, 'no score before 5 trades');
  for (let i = 0; i < 6; i++) core.buy(buyer(), list(seller, admin, 25));
  assert.throws(() => core.releaseDeposit(seller()), /10 confirmed/);              // still inside the 24h hold
  clock.t += DAY + 1;
  assert.equal(core.wallet(seller()).redeemable, 250);
  assert.equal(core.trust(seller().id).percent, 100);
  assert.throws(() => core.requestWithdrawal(seller(), 199), /Amount/);
  assert.throws(() => core.requestWithdrawal(seller(), 251), /up to 250/);
  const w = core.requestWithdrawal(seller(), 200);
  assert.equal(seller().balance, 550);
  assert.throws(() => core.resolveWithdrawal(buyer(), w.id, true, 'AMZN-1'), /Admins only/);
  core.resolveWithdrawal(admin(), w.id, true, 'AMZN-1234');
  assert.equal(core.wallet(seller()).withdrawals[0].voucher, 'AMZN-1234');
  bucketsMatchLedger();
});

test('withdrawal by a pure buyer is refused; rejected withdrawal returns coins; deposit release works', () => {
  const { core, clock, mk, fund, list, bucketsMatchLedger } = setup();
  const admin = mk('admin', true), seller = mk('seller'), buyer = mk('buyer');
  fund(seller, 100); fund(buyer, 600); core.activateSeller(seller());
  assert.throws(() => core.requestWithdrawal(buyer(), 200), /up to 0 earned/);
  for (let i = 0; i < 10; i++) core.buy(buyer(), list(seller, admin, 25));
  clock.t += DAY + 1;
  const w = core.requestWithdrawal(seller(), 250);
  core.resolveWithdrawal(admin(), w.id, false);
  assert.equal(seller().balance, 250); assert.equal(core.wallet(seller()).redeemable, 250);
  core.releaseDeposit(seller());
  assert.equal(seller().locked, 0); assert.equal(seller().balance, 350); assert.equal(seller().seller_status, 'none');
  assert.equal(core.wallet(seller()).redeemable, 250, 'released deposit is spendable, not redeemable');
  bucketsMatchLedger();
});

test('top-up webhook replay credits once; admin cannot act on own items; codes encrypted at rest', () => {
  const { core, mk, fund } = setup();
  const admin = mk('admin', true), buyer = mk('buyer');
  const o = core.createTopup(buyer(), 100);
  core.confirmTopup(o.order_id, 'p1', 100); core.confirmTopup(o.order_id, 'p1', 100);
  assert.equal(buyer().balance, 100);
  const o2 = core.createTopup(buyer(), 100);
  assert.throws(() => core.confirmTopup(o2.order_id, 'p2', 50), /mismatch/);
  assert.throws(() => core.confirmTopup(o2.order_id, 'p1', 100), /already used/);
  assert.throws(() => core.createTopup(buyer(), 5), /Amount/);
  fund(admin, 100); core.activateSeller(admin());
  const { id } = core.createListing(admin(), { brand: 'Uber', category: 'Travel', discount: '50 off', expiry: '2027-01-01', code: 'SECRET-XYZ', price: 5, screenshot: PNG });
  assert.throws(() => core.reviewListing(admin(), id, true), /own listing/);
  assert.throws(() => core.adminQueue(buyer()), /Admins only/);
  const row = core.db.prepare('SELECT code_enc FROM listings WHERE id = ?').get(id);
  assert.equal(row.code_enc.includes('SECRET'), false);
});
