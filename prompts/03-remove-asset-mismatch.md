# 03 Accept sales between wallets in different assets

- When: 2026-10-16 13:32 COT · Tool: Claude Code (model to confirm by the author) · Who: VictorJVA
- Files: `limits.ts`, `sales.ts`, the `debitAmount` migration, views and tests (commit fc9ea1b, PR #2)
- Kept or changed: to fill in by the author

## Prompt (verbatim)

````text
Read SDD.md sections 7–10 and 15. A sale must never be blocked because the buyer's and the vendor's wallets use different assets: remove the ASSET_MISMATCH rule from `tap-to-pay-svc`.

The caps (perPaymentLimit, dailyLimit) stay in the buyer's asset, so check them against what the buyer actually pays:

1. Same asset: no change. The caps are checked against the sale amount before any wallet call.
2. Different assets: create the incoming payment and the quote, then check the caps against the quote's `debitAmount`. If a cap is exceeded, fail the sale with LIMIT_PER_PAYMENT or LIMIT_DAILY before the outgoing payment, so no money moves.

Changes:
- `limits.ts`: split `canCharge` into `checkBuyer` (BUYER_UNKNOWN, GRANT_MISSING) and `checkLimits(buyer, debit, spentToday)`. Limit messages name the asset ("max 20.00 USD").
- `OpenPayments.createQuote` returns `{ id, debitAmount, assetCode, assetScale }`.
- `Sale` gets `debitAmount`, `debitAssetCode` and `debitAssetScale` (new migration, backfilled for claimed sales). `sumSpent` adds up `debitAmount`, not `amount`.
- `SaleView` returns the debit fields. Remove ASSET_MISMATCH from `contracts.ts` and the seed warning.
- Update the SDD where it describes the rule (sections 2, 7, 8, 9, 10, 15).

Tests: a cross-asset sale ends PAID with the quote's debit stored and counted; a cross-asset sale over either cap fails with no outgoing payment; a same-asset sale stores its own amount as the debit. Finish with `npm run typecheck` and `npm test` green.
````
