# CouponShop — Buyer & Seller Rules (v2)

*Working draft — meant to be turned into your in-app Terms/Rules page and used as the logic spec for your build.*

---

## 1. General Account Rules

- Every user must sign up with **Google Sign-In** and verify their **phone number via OTP** before they can buy or sell.
- One verified phone number = one account. No duplicate accounts per person.
- Users start as **Buyers** by default. Anyone can request a **Seller** upgrade.
- Age requirement: 18+ (India — for financial transactions and account liability).
- **Buyer opening coin balance = 0.** Coins only enter the system when a buyer tops up.

---

## 2. Wallet & Top-Up Rules

1. Buyers top up their wallet with **their own money via UPI**.
2. UPI payment is **instantly converted to coins** and credited to the buyer's wallet at a fixed rate of **1 coin = ₹1**.
3. **Every transaction is logged** in the database: top-ups, purchases, sales, refunds, withdrawals, free-coupon claims. Each entry needs at minimum: user ID, type, amount, timestamp, related listing ID, and status.
4. This transaction log is also your primary evidence source for dispute resolution and strike verification.

---

## 3. Buyer Rules

1. Buyers can browse and search all **verified, active (non-expired)** coupon listings.
2. To purchase a coupon, the buyer must have sufficient **coin balance**.
3. Once a coupon code is revealed/copied, the sale is **final** — no refunds for buyer's remorse or unused codes.
4. **Refund/report window: 24 hours** after purchase. Within this window, a buyer can report a coupon as:
   - Invalid / already used
   - Expired at time of sale
   - Doesn't match listed brand/value
5. Valid reports (confirmed by admin/screenshot evidence) trigger a **coin refund** to the buyer and a **strike** against the seller (see §6).
6. Buyers cannot resell a coupon they just purchased — it's for personal use once bought.
7. Abuse of the report system (false reports to get free coins) results in a warning, then account suspension.

---

## 4. Seller Rules

### Becoming a Seller
1. To list coupons, a user must **top up ₹100**, which is **locked/frozen** as a security deposit.
2. The ₹100 is **not usable for purchases** while locked — it exists purely as a trust/penalty buffer.

### Listing & Verification
3. Every listed coupon must include: brand, category, discount value/type, expiry date, and any usage terms (min. order value, one-time use, etc.).
4. **Sellers must upload a screenshot of the coupon** they received (from the brand's app/email/SMS) at the time of listing. This is stored securely and used for verification and dispute evidence — never shown publicly with the code visible.
5. All listings go through **verification** (automated expiry check + screenshot/manual review) before going live.
6. Sellers set their own coin price within platform-suggested ranges.
7. **Sellers price every paid listing between 1 and 25 coins** — this is the amount the seller receives.
8. **Platform fee: ₹1 per listing, added on top of the seller's price.** If a seller prices a coupon at ₹25, the buyer sees and pays **₹26** total. The seller still receives their full ₹25 — the ₹1 goes to the platform as a transaction/maintenance fee and is **not** part of the seller's payout.
9. This means the **buyer-facing price range is effectively ₹2–₹26**, even though the seller's set price is ₹1–₹25. Make sure your listing UI clearly shows both numbers (seller price vs. total buyer price) to avoid confusion.
10. Log the ₹1 fee as its own line item in the transaction ledger per sale, separate from the seller's earned coins — you'll want this for revenue tracking and for any future tax/compliance reporting.

### Coin-to-₹ Conversion & Withdrawals
11. **Minimum conversion for sellers: 200 coins** before a payout/gift-card redemption can be requested.
12. Sellers can withdraw **earned coins** (converted to gift cards) once they hit the 200-coin minimum.
13. The **₹100 locked deposit** can only be withdrawn after:
    - Completing **10 confirmed good sales**, AND
    - Having zero unresolved strikes at the time of the request
14. **No direct cash withdrawal.** Redemptions are issued only as **Amazon gift cards or other supported vouchers** — never as bank transfer or cash. This applies to both sellers withdrawing earnings and buyers redeeming leftover coin balance.

### Reinstatement After Termination
15. A terminated seller can **reapply for seller access after 90 days**, by paying a **non-refundable ₹50 reapplication fee**.
16. Reapplication also requires putting up a **fresh ₹100 security deposit** (the original one was already forfeited).
17. **This reinstatement path is available twice.** If the seller is terminated a **third time** (i.e., they reoffend after their second reinstatement), they are **permanently blocked from ever becoming a seller again** — no further reapplication, at any fee, ever. They retain buyer access only.

---

## 5. Free Coupon Giveaways (Ad-Supported)

For sellers who don't want to sell a coupon, they can **give it away for free** instead.

1. Free listings go through the **same verification process** as paid listings (screenshot required, expiry checked).
2. To **claim** a free coupon, a buyer must **watch an ad** before the code is revealed.
3. The **same 3-strike rule applies** to free listings — if a "seller" gives away 3 expired/invalid coupons (confirmed via reports), they lose seller privileges exactly as with paid sales.
4. Ad revenue can offset your platform's payout costs — but track free-coupon claims in the transaction log too, even though no coins change hands, so strikes and history stay consistent across both flows.

---

## 6. Trust Score (Trade Percentage)

Every user gets a **visible trust/trade percentage**, shown on their profile and on their listings.

1. **Formula (starting point):** `Trust % = (Successful trades / Total trades) × 100`
   - "Successful trade" = sale/giveaway with no valid buyer report.
   - "Total trades" = all completed sales + giveaways.
2. New users start with **no score shown** (e.g., "New Seller") until they hit **5 completed trades**, to avoid one bad sale tanking a brand-new account to 0%.
3. Trust % should visibly **drop with each confirmed strike**, independent of the 3-strike termination rule — so buyers can see risk *before* a seller is fully terminated.
4. Consider a small trust bonus for **verified/fast responders** or high-volume sellers — optional, for v2.
5. Trust % is **separate from strikes**: strikes are the hard penalty system (3 = termination); trust % is the soft, ongoing signal buyers see before purchasing.

---

## 7. Strike & Penalty Summary Table

| Violation | Consequence |
|---|---|
| 1 confirmed expired/invalid coupon (sold or given free) | Strike #1 — warning, trust % drops |
| 2 confirmed expired/invalid coupons | Strike #2 — warning + listing review, trust % drops further |
| 3 confirmed expired/invalid coupons | Seller terminated + ₹100 deposit forfeited (reapply after 90 days for ₹50 fee) |
| 3rd termination (2nd reoffense after reinstatement) | **Permanently banned from selling** — no further reapplication, ever |
| False buyer reports (proven) | Warning → account suspension |
| Listing coupons not owned/already used | Immediate termination, no deposit refund |

---

## ⚠️ Open Items Still to Decide

1. **Dispute resolution** — admin manual review recommended for v1, using the screenshot + transaction log as evidence.
2. **Compliance:** Coins purchased with real money (UPI) and redeemable for gift cards is a stronger signal toward Prepaid Payment Instrument (PPI) territory under RBI rules than before — get this specific flow reviewed by a fintech lawyer before launch, since real money is now directly entering the coin system.

---

*Next: data schema (users, listings, coin ledger, strikes, trust score, screenshots) — ready whenever you want it.*