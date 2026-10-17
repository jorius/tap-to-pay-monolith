# 02 Backend service from the SDD

- When: 2026-10-16 12:25 COT · Tool: Claude Code (model to confirm by the author) · Who: VictorJVA
- Files: `tap-to-pay-svc/` services, routes, Prisma schema, Open Payments client, scripts and tests (commit c7cc580, PR #1)
- Kept or changed: to fill in by the author

## Prompt (verbatim)

````text
Read SDD.md (sections 7–13 are the spec). Build the complete backend in `tap-to-pay-svc/` on top of the existing scaffold (package.json, tsconfig, docker-compose, .env.example, src/app.ts, src/server.ts). The SDD says `apps/api` and `packages/contracts`; here the service lives in `tap-to-pay-svc/` and the view types go in `src/contracts.ts`. Keep the pinned versions from section 5.

Build in this order, tests green before moving on:

1. `src/services/money.ts` and `limits.ts` (`parseAmount`, `formatAmount`, `canCharge`, `remainingToday`, `dayRange` with DST handling) + tests.
2. Prisma 7 (`prisma-client` generator to `src/generated/prisma`, `@prisma/adapter-pg`, `prisma.config.ts`): Buyer, Vendor, Sale, `SaleStatus`, index `(buyerId, status, createdAt)`, initial migration. `src/db/repos.ts`: `Repo` interface and `PrismaRepo` (`transitionSale` as a conditional `updateMany`, `sumSpent`).
3. `src/open-payments/types.ts` (`OpenPayments`, `WalletInfo`, `WalletError`, `isUnauthorized`, `toWalletError`), `src/services/{errors,views,buyers,sales}.ts` with `Deps` injection. `chargeSale` follows section 10 step by step: rules in order with no wallet call on refusal, conditional claim, incoming payment, quote, outgoing payment with token rotation on 401/403 and one retry, 4xx → `WALLET_ERROR`, timeout/5xx → stays `CHARGING`, completion by `receivedAmount`, a polling error never fails a sale. `tests/fakes.ts` (`FakeRepo`, `FakeOpenPayments`, clock pinned to 2026-10-14T15:00:00Z) and every case in the section 13 table.
4. `src/config.ts` (one zod schema), `createApp(deps, meta)` with the four routers, the `{ data, error }` envelope, and the error mapping from section 7. The 9 endpoints and the exact messages from section 9. `scripts/seed.ts`. Supertest tests.
5. `src/open-payments/client.ts` with `@interledger/open-payments` (15 s timeout, non-interactive grants per charge, `getPublic`, `token.rotate`), `hash.ts` (`verifyInteractionHash`, tolerant per section 10), and `scripts/grant-buyer.ts` (listener on `localhost:4100/finish`). Wire everything in `server.ts`.

Rules: services never import Prisma or the SDK; amounts are `bigint` internally and digit strings in JSON; never return or log the grant token; mark each section 11 shortcut with a `shortcut:` comment. Add the scripts `db:migrate`, `db:generate`, `seed`, `grant:buyer`. Finish with `npm run typecheck` and `npm test` green, and give a summary of files and tests.
````
