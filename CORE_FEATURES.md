# Direla: Repository Features and SoftPOS Credit Opportunity

Code review and product proposal, October 16, 2026. Feature status is based on the repository. No live payments, NFC transactions, or third-party services were tested. Some existing documentation describes features as complete; this document distinguishes connected flows from demonstrations and mock data.

## 1. Architecture

- **Mobile/web app:** Expo 53, React Native, TypeScript, and Expo Router. Five tabs: Wallet, Pay, Merchant, Lending, and Settings (`app/(tabs)/_layout.tsx`).
- **Payments API:** Express and `@interledger/open-payments` (`backend/server.js`), default port 3001.
- **WhatsApp service:** Separate Express/TypeScript server with Twilio, Supabase, Google Translate, and OpenAI (`whatsapp-integration/`), port 5001.
- **Main UI currency:** South African rand (ZAR). Parts of the API accept a currency and asset scale as inputs.

## 2. Existing feature inventory

### Wallet and transactions — local demo

The Wallet screen shows a balance, reward points, online status, and transaction history. Users can hide the balance and refresh the view. The initial balance (`R 2,847.50`), points, and transactions are local component state, not wallet-provider data (`app/(tabs)/index.tsx:44`, `:81`, `:116`).

**Add money** offers bank, mobile-money, and cash forms. It waits briefly, updates the local balance, adds a local transaction, and grants points (`app/(tabs)/index.tsx:122`, `:203`, `:218`, `:270`). **Withdraw** offers bank, ATM, and pickup methods, validates the local balance, and subtracts funds locally (`:167`, `:296`, `:310`, `:360`). Neither flow moves money through a financial provider.

### Merchant QR collection — partially connected

The merchant enters an amount and description in ZAR. `QRCodeGenerator` calls `POST /api/qr/generate` and displays the result with `react-native-qrcode-svg` (`components/QRCodeGenerator.tsx:21`, `:30`, `:41`). Its share action sends payment details as text, not necessarily the QR image (`:90`).

The API requests a grant, creates an Open Payments incoming payment, and places its ID, merchant wallet, amount, currency, description, and timestamp in the QR payload (`backend/server.js:189`, `:259`). The QR route calls its own incoming-payment endpoint through a hard-coded IP (`backend/server.js:265`), making it dependent on that address.

### Customer QR payment — implemented flow, live outcome unverified

The Pay screen requests camera permission, scans and parses JSON, and validates the QR type (`app/(tabs)/pay.tsx:232`, `:489`). It calls `/api/payment/quote`, displays the send and receive amounts, and asks for confirmation (`:317`, `:374`; `backend/server.js:311`).

The backend's `/api/payment/send` requests an outgoing-payment grant. For interactive consent, the app opens an authorization URL and polls `/api/payment/complete`; the backend continues the grant and creates an outgoing payment (`backend/server.js:437`, `:582`, `:682`; `app/(tabs)/pay.tsx:237`, `:390`). This path is present in code, but this review did not verify a successful transfer. Authorization data is stored in an in-memory `Map` (`backend/server.js:434`).

There is also a separate `components/QRCodeScanner.tsx`. It creates a timestamp-based transaction ID and reports simulated success (`:45`-`:57`). The Pay screen uses its own scanner and payment path; the separate component does not prove a real transfer.

### Other customer payment methods — mostly prototypes

The Pay tab offers QR, WhatsApp, tap/NFC, and contacts. Quick contacts and nearby merchants are hard-coded, not read from device contacts or location (`app/(tabs)/pay.tsx:42`, `:51`, `:58`). Contact payment reuses the QR/Open Payments flow but does not resolve a phone number to that person's wallet (`:65`-`:123`). WhatsApp and NFC payment completion is simulated (`:140`-`:160`). No NFC acceptance implementation is visible.

### Merchant dashboard — mostly mock data

Daily/monthly revenue, customer count, sales periods, and recent transactions are fixed values (`app/(tabs)/merchant.tsx:43`-`:80`). The **Accept Payments** switch changes local state but is not enforced by the backend (`:92`). **Download Report** shows an alert without creating a file (`:112`). The QR action does open the generator (`:100`, `:170`).

### WhatsApp requests and assistant — partial integration

The merchant can enter amount, description, and phone number (`components/WhatsAppPaymentInitiator.tsx`). The app generates an OTP and calls an external `/incoming-payment` endpoint (`app/(tabs)/merchant.tsx:120`). The separate service exposes `/send`, `/otp`, `/incoming-payment`, `/incoming-payment-link`, `/new-message`, and `/payment-complete` (`whatsapp-integration/server.ts`).

The inbound webhook treats any numeric message as an OTP and replies that the transaction was confirmed; it does not compare the value with a stored challenge or execute an Open Payments transfer (`whatsapp-integration/server.ts:210`-`:234`). The payment-link route sends a payment ID in a message, not a verified payment receipt. `components/WhatsAppLinkGenerator.tsx` is not connected to the main merchant flow.

The service uses Twilio for messages, Supabase for preferences/history, Google Translate for English, Zulu, and Xhosa, and OpenAI for support replies and language changes (`whatsapp-integration/whatsapp.ts`, `translate.ts`, `types.ts`). It requires external credentials. Capabilities described in its AI prompt are not necessarily implemented in the app.

### Lending and settings — UI prototypes

Lending has borrow/lend views, a fixed initial score of `742`, hard-coded offers, and opportunities. Applying only displays an alert (`app/(tabs)/lending.tsx:37`-`:99`, `:120`). There is no real underwriting, origination, disbursement, or repayment.

Settings has local switches for notifications, biometrics, offline mode, and sync. Profile, payment methods, history, PIN, privacy, language, help, and logout mainly display placeholder alerts (`app/(tabs)/settings.tsx:14`-`:22`, `:77`-`:203`). Persistent preferences and user authentication are not visible.

### Payments API

| Route                                 | Purpose                                    |
| ------------------------------------- | ------------------------------------------ |
| `GET /health`, `GET /api/server/info` | Status and service metadata                |
| `GET /api/wallet/:address`            | Wallet address lookup                      |
| `POST /api/payment/incoming`          | Grant and incoming payment creation        |
| `POST /api/qr/generate`               | QR payment payload                         |
| `POST /api/payment/quote`             | Payment quote                              |
| `POST /api/payment/send`              | Interactive grant or outgoing payment      |
| `POST /api/payment/complete`          | Continue grant and create outgoing payment |
| `GET /payment/complete`               | Browser authorization callback             |

Source: `backend/server.js:114`-`:733`. Configuration requires a wallet address, key ID, and private-key path (`backend/server.js:17`-`:40`). The merchant wallet can be separate; otherwise, the client wallet is reused.

## 3. Product proposal: SoftPOS that builds a portable business record

### Core idea

An informal seller accepts payments on a phone through NFC, with QR as a fallback. Each confirmed payment contributes to a business activity record that the seller can inspect and choose to share with lenders. **Every digital sale builds seller-controlled evidence of business activity.**

Call the output a **verifiable business activity statement**, not automatic proof of creditworthiness. Received payments show observed sales; they do not alone establish profit, all expenses, business identity, or repayment capacity.

### Priority features

#### 1. NFC collection with QR fallback

- Enter an amount and show the real payment state: pending, confirmed, or failed.
- Offer QR when NFC, the customer's device, or the provider cannot support the flow.
- Issue a receipt only after provider confirmation.

NFC is an interaction channel, not universal authority to accept any bank card. The exact acceptance flow needs a compatible provider and the approvals required in the target market.

#### 2. Verified sales ledger

- Store confirmed payments with date, amount, currency, merchant ID, provider transaction ID, and final state.
- Reconcile records with the provider and retain refunds, reversals, and adjustments.
- Allow cash entries, clearly labeled **seller-declared** rather than network-verified.
- Offer search, filters, and export.

A generated QR, quote, pending authorization, or failed attempt must not count as a sale.

#### 3. Explainable cash-flow profile

Show verified weekly/monthly sales, active days, length of history, typical sale, changes in volume, and refunds. Every metric should state its time range and data coverage. If the platform sees only part of the business's sales, the profile must say so.

#### 4. Seller-controlled verifiable statement

With explicit consent, issue a signed summary for a chosen lender and period. It can include verified sales volume, payment count, active days, coverage period, reconciliation method, issuer, and issue date. The lender verifies the signature and evaluates the evidence under its own policy. Share aggregates where possible instead of customer-level records.

A W3C Verifiable Credential is a possible portable format. Its signature can prove who issued a statement and that it was not altered; it does not automatically prove that the underlying data are true. Reconciliation and trust in the issuer are essential.

#### 5. Path to financing

Show the seller what evidence is available, what an application still needs, and which lender has permission to view a statement. A partner lender can return an offer and application status. Do not invent a credit score or promise approval. The lender decides eligibility, amount, pricing, and risk policy.

### End-to-end flow

```text
Seller accepts NFC or QR payment
             ↓
Provider confirms payment
             ↓
Backend stores and reconciles sale
             ↓
Business activity profile updates
             ↓
Seller consents to share signed summary
             ↓
Lender verifies statement and evaluates financing
```

### Interledger's role

Interledger connects payment networks; it is not a public blockchain with a universally queryable credit history. Open Payments provides incoming-payment resources and an authorized list operation for payments associated with a wallet address. The product must build its own reliable commercial record from confirmed and reconciled payments. The proposed “proof” is a **signed claim based on verified payment data**, issued by the platform or a trusted provider, not an automatic feature of Interledger.

## 4. Recommended MVP

1. Choose an NFC acceptance provider and implement QR fallback.
2. Persist confirmed payments and reconcile them with the provider.
3. Give sellers a searchable ledger and a clear 90-day activity summary.
4. Issue a signed statement shared through explicit consent.
5. Pilot it with one lender to learn whether the evidence changes lending decisions or terms.

**Pilot question:** Does the lender find the verified payment history trustworthy and useful enough to offer financing to sellers without a conventional credit file?

### What to reuse from this repository

- **Starting point:** incoming payments, QR generation, scanning, quotes, and interactive Open Payments consent (`backend/server.js`, `components/QRCodeGenerator.tsx`, `app/(tabs)/pay.tsx`).
- **Redesign:** merchant dashboard as a real sales ledger and analytics view (`app/(tabs)/merchant.tsx`).
- **Visual reference only:** lending screen; its score and offers are fixed (`app/(tabs)/lending.tsx`).
- **Build:** real NFC acceptance, persistent storage, reconciliation, merchant identity, consent, signed statements, and lender integration. The current NFC option is simulated.

## 5. Risks and prerequisites

1. **Fixed network addresses:** several calls use different hard-coded HTTP IPs (`app/(tabs)/pay.tsx:81`, `components/QRCodeGenerator.tsx:41`, `config/api.config.js:7`, `backend/server.js:265`). Centralize configuration.
2. **Payment authorization:** CORS is broad, the API does not show its own authentication, and authorization state is held in memory (`backend/server.js:13`, `:434`). `/api/payment/complete` accepts a matching `quoteId` **or any recent authorization**; bind each authorization strictly to its quote before processing value (`backend/server.js:594`-`:601`).
3. **WhatsApp OTP:** the app uses `Math.random()` and the webhook accepts any numeric reply (`app/(tabs)/merchant.tsx:121`; `whatsapp-integration/server.ts:216`). This is not secure payment authorization.
4. **Artificial sales:** self-payments or circular transactions could inflate the profile. Add reconciliation, identity controls, concentration checks, and fraud review.
5. **Incomplete coverage:** cash and other providers will not be network-verified without additional integrations. Keep declared and verified data distinct.
6. **Privacy and interpretation:** share the minimum necessary information with consent. Sales volume is not profit or repayment capacity.
7. **Secrets and documentation:** `private.key` exists in the repository root; review it and rotate it if real before reuse or publication. Existing claims of production readiness exceed what the reviewed code demonstrates. The referenced `backend/.env.example` was not found in the reviewed file list.

## References

- [Interledger Protocol](https://interledger.org/developers/rfcs/interledger-protocol/)
- [Open Payments: list incoming payments](https://openpayments.dev/sdk/incoming-list/)
- [World Bank: digital payments and small-business access to credit](https://blogs.worldbank.org/en/allaboutfinance/when-digital-payments-unlock-access-to-credit--new-evidence-from)
- [BIS: consent-based commercial data sharing for credit](https://www.bis.org/publ/bppdf/bispap120.pdf)
- [W3C Verifiable Credentials data model](https://www.w3.org/TR/vc-data-model-2.1/)
