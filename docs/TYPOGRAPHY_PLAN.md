# Typography Roll-out — "Soft Editorial"

The product owner chose **Fraunces + Plus Jakarta Sans** (pairing 1 of 6,
October 2026) to make UnieMax more elegant and easier to read, especially in
My Shops for low-literacy sellers. This file tracks the roll-out phase by
phase. Font facts themselves (files, tokens, rules) live in
[`FRONTEND_CONTEXT.md`](./FRONTEND_CONTEXT.md) → Theme → Fonts.

Status: ☐ planned · ◐ in progress · ☑ done

| Role | Face | Where |
| ---- | ---- | ----- |
| Headings, product names, prices | Fraunces (serif, optical size) | `font-heading`, `h1–h3` |
| Everything you read and tap | Plus Jakarta Sans | `font-body` (default) |
| Prices, totals, counts | Plus Jakarta Sans, equal-width digits | `font-figure` — product page, cards, cart, checkout, dashboards |
| Small elegant touches | Fraunces italic 500 | `font-accent` — taglines, sub-lines, one word in a heading |

## Phase 1 — Foundation ☑
- Self-hosted fonts (latin + latin-ext per style, `unicode-range`), ₹ verified
  as a real glyph in all four files; Manrope / Inter removed.
- Root size 90% → **100%** (body text 14.4px → 16px) in both apps.
- `--font-accent` token + `font-accent` utility; `typography.ts` updated.
- Seller dashboard: "Total sales" gets its own row on a phone so large
  amounts are not cut off by the bigger numerals.
- Checked: 13 My Shops pages at 360px — no sideways scroll, no input under
  16px; shop page, marketplace home and dashboard screenshots.

## Phase 1b — Professional numbers ☑
- Prices and counts moved off the serif to `font-figure` (product page price
  and MRP, product cards, cart / checkout / order totals, marketplace prices,
  seller dashboard and order-detail totals, admin stat tiles).

## Phase 2 — Shop pages (customers) ☐
- Hero: shop tagline in `font-accent`; type scale for hero, section headings,
  product cards, prices.
- Product page, cart, checkout and order confirmation on the new scale.

## Phase 3 — My Shops (sellers) ☐
- Larger text and more space: page headers, list rows, form labels and hints,
  bottom tab bar, sheets.
- `font-accent` only for encouragement lines ("Your shop is *doing well*").
- Re-run the 360px sweep (tap targets, input sizes, overflow).

## Phase 4 — Marketplace & account ☐
- Home, Sell landing page, login, profile, orders, support.

## Phase 5 — Admin console ☐
- Same scale; denser tables keep `text-sm` where scanning matters.
