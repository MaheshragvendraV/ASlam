# CouponShop

A small marketplace for unused coupons, built from `CouponShop-Rules-v2.md` — simplified, with security built in.

- **Zero npm dependencies.** Node 22.13+ only (built-in HTTP, SQLite and crypto).
- **~1,000 lines**: `lib/core.js` (all rules), `lib/db.js` (schema), `server.js` (HTTP), `public/` (UI).

## Run it

```bash
npm run dev      # http://localhost:3000 with fake login, on-screen OTP and simulated UPI
```

```bash
npm test
```

To try the admin screens in dev mode: `ADMIN_EMAILS=you@example.com npm run dev`, then sign in with that email.

## What was simplified (vs. the v2 rules)

| v2 rules | This app |
|---|---|
| Seller upgrade request flow | One button: lock 100 coins from your wallet. |
| "Platform-suggested price ranges" | Dropped. Seller price is 1–25 (0 = free giveaway); buyer pays price + 1. |
| Reveal/copy step before a sale is final | Buying shows the code immediately. |
| Refund clawed back from seller | Seller earnings sit in a **24-hour hold** (same as the report window), so refunds never need a clawback. |
| Buyers and sellers can both redeem coins | **Only coins earned from sales** can become gift cards. Topped-up coins can only be spent. |
| Report evidence uploads | Buyer picks a reason + note; admin compares the seller's screenshot, the code and the ledger. |
| Trust bonuses | Dropped. Trust % = good trades ÷ all trades, shown after 5 trades. |
| "Unresolved strikes" | Deposit release needs 10 good sales and no open reports. |

Everything else in the rules is implemented: 3 strikes → termination + deposit forfeit, 90-day/₹50 reapply (twice), permanent ban on the third termination, ad-gated free coupons with the same strike rule, false-report warning → suspension, immediate termination for fraud.

## Security

- **Money**: every coin movement goes through one function inside a DB transaction and writes an **append-only ledger** (DB triggers block edits/deletes). Wallet columns have `CHECK (>= 0)`, so an overdraft is impossible even if the code has a bug. The ₹1 fee is its own ledger line.
- **Coupon codes** are AES-256-GCM encrypted at rest and only sent to the buyer after payment (and to admins for review). The same code cannot be listed twice, which also blocks reselling a bought coupon.
- **Screenshots** are type-checked by content, size-limited, stored outside the web root under random names, and only served to admins.
- **Sessions**: random 256-bit token, stored hashed, `HttpOnly; SameSite=Strict; Secure` cookie.
- **CSRF**: same-origin check + required custom header. **XSS**: strict Content-Security-Policy, no inline scripts, UI never uses `innerHTML`.
- **OTP**: 6 digits, hashed, 5-minute expiry, 5 attempts, rate-limited per user, phone and IP.
- **Top-ups** are only credited by an HMAC-signed webhook; replays are harmless. Per-top-up cap ₹2,000, wallet cap 10,000 coins.
- **Admins** cannot review their own listings, reports or gift-card requests; every admin action is audited.
- Rate limits on all API routes; all SQL is parameterised.

## Going to production

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | **Required.** 32+ random characters. Encrypts codes; do not lose or change it. |
| `GOOGLE_CLIENT_ID` | **Required.** Google Sign-In web client ID. |
| `ADMIN_EMAILS` | Comma-separated Google emails with admin access. |
| `SMS_WEBHOOK_URL` | HTTPS endpoint that sends the OTP SMS. Receives `{"to": "+91…", "message": "…"}`. |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret for `POST /api/webhooks/payment`. |
| `TRUST_PROXY=1` | Set when behind a reverse proxy (uses `X-Forwarded-For`). |
| `PORT`, `DATA_DIR` | Defaults: `3000`, `./data`. |

Run behind HTTPS (the session cookie is `Secure`). Back up `DATA_DIR`.

**Still to wire up before launch**

1. **UPI gateway adapter.** The server expects the webhook body `{"order_id", "payment_id", "amount", "status": "paid"}` with an `X-Signature` header (hex HMAC-SHA256 of the raw body). Your gateway's format will differ — add a small adapter, and have the UI open the gateway checkout after `/api/topup` returns the order.
2. **SMS provider** behind `SMS_WEBHOOK_URL`.
3. **Ad network.** The free-coupon wait (15 s) is enforced by the server; the ad slot in `claimFlow()` is a placeholder.
4. **Google Sign-In** is implemented (token signature, audience, issuer, expiry checked) but has not been tested against a real client ID.
5. **Legal review.** Real money → coins → gift cards may fall under RBI prepaid-instrument rules. The earned-coins-only redemption and wallet caps reduce exposure but do not replace a fintech lawyer's review.
