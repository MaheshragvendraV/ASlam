'use strict';
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,                         -- one verified phone = one account
  phone_verified_at INTEGER,
  age_confirmed_at INTEGER,
  is_admin INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),   -- spendable coins
  pending INTEGER NOT NULL DEFAULT 0 CHECK (pending >= 0),   -- sale earnings in 24h escrow
  locked  INTEGER NOT NULL DEFAULT 0 CHECK (locked  >= 0),   -- seller security deposit
  earned  INTEGER NOT NULL DEFAULT 0 CHECK (earned  >= 0),   -- settled earnings not yet withdrawn
  seller_status TEXT NOT NULL DEFAULT 'none' CHECK (seller_status IN ('none','active','terminated','banned')),
  seller_since INTEGER,
  strikes INTEGER NOT NULL DEFAULT 0,
  terminations INTEGER NOT NULL DEFAULT 0,
  terminated_at INTEGER,
  warnings INTEGER NOT NULL DEFAULT 0,
  suspended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid')),
  provider_ref TEXT UNIQUE,                  -- makes webhook replays harmless
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  seller_id INTEGER NOT NULL REFERENCES users(id),
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  discount TEXT NOT NULL,
  terms TEXT NOT NULL DEFAULT '',
  expiry TEXT NOT NULL,                      -- YYYY-MM-DD (IST)
  price INTEGER NOT NULL CHECK (price BETWEEN 0 AND 25),   -- 0 = free giveaway
  code_enc TEXT NOT NULL,                    -- AES-256-GCM
  code_hash TEXT UNIQUE,                     -- blocks the same code being listed twice
  screenshot_file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','live','rejected','sold','removed')),
  reject_reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS listings_status ON listings(status, expiry);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL UNIQUE REFERENCES listings(id),   -- a coupon sells once
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0,
  outcome TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok','refunded')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_seller ON trades(seller_id);
CREATE INDEX IF NOT EXISTS trades_buyer ON trades(buyer_id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  trade_id INTEGER NOT NULL UNIQUE REFERENCES trades(id),
  reason TEXT NOT NULL CHECK (reason IN ('invalid','expired','mismatch')),
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','valid','rejected','abuse')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by INTEGER
);

CREATE TABLE IF NOT EXISTS claims (
  user_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','fulfilled','rejected')),
  voucher_enc TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

-- Append-only coin ledger. user_id NULL = the platform.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('balance','pending','locked','platform','none')),
  listing_id INTEGER,
  ref TEXT,
  status TEXT NOT NULL DEFAULT 'posted',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id);
CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger
  BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger
  BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`;

function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
