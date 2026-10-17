# AI Usage

State as of 2026-10-16, commit `5ce21db`. AI helped with every file of code in this repository.

## Tools used

| Tool | Model / plan | Used by | What we used it for |
| --- | --- | --- | --- |
| Claude Code | Claude | The whole team: Jorius, VictorJVA, Jacobo Zuluaga, Santiago | Design document, product research, mobile app, NFC native module, service, tests, coding prompts, local setup and debugging |

## Where AI was used

| File / component | Tool | How AI was used |
| --- | --- | --- |
| `SDD.md` | Claude Code | Edited during the event from our design: Mermaid architecture diagram, two-folder layout, multi-wallet and cross-asset sections |
| `CORE_FEATURES.md` | Claude | Review of an existing payments app and the SoftPOS product proposal |
| `tap-to-pay-svc/` and `tap-to-pay-app/` scaffolds | Claude Code | Generated from `prompts/RAW_initial_prompt.txt` |
| `tap-to-pay-app/src/app/` (welcome, role picker, vendor and buyer tabs, debug) | Claude Code | Screens and navigation generated, then redesigned for UI/UX |
| `tap-to-pay-app/src/components/`, `src/constants/theme.ts` | Claude Code | Components and theme generated: keypad, sale sheet, charts, payment feedback, status pills, wallet panels |
| `tap-to-pay-app/src/hooks/`, `src/api/`, `src/i18n/` | Claude Code | The sale state machine, session, API client and translations generated |
| `tap-to-pay-app/modules/nfc-tap/` (`Apdu.kt`, `HceCardService.kt`, `NfcTapModule.kt`), `scripts/nfc-logs.sh`, `scripts/build-apk.sh` | Claude Code | Native Kotlin module for the HCE card and the NFC reader generated from `SDD.md` section 6 |
| `tap-to-pay-app/.gitignore` | Claude Code | Stopped tracking the module's Android build output |
| `tap-to-pay-svc/src/services/` (`money`, `limits`, `sales`, `buyers`, `vendors`, `views`, `public-names`, `debug`) | Claude Code | Generated from `SDD.md` sections 7–10 with `prompts/backend-service.txt`, then extended: cross-asset sales (`prompts/remove-asset-mismatch.txt`), several wallets per buyer and per vendor, grant limits, public wallet names |
| `tap-to-pay-svc/prisma/` (schema and migrations), `src/db/` | Claude Code | Generated; migration SQL produced with `prisma migrate diff` |
| `tap-to-pay-svc/src/app.ts`, `src/routes/`, `src/config.ts`, `src/server.ts`, `src/contracts.ts` | Claude Code | Generated from `SDD.md` sections 7, 9 and 12, then extended with new routes and logging |
| `tap-to-pay-svc/src/open-payments/` | Claude Code | SDK client, errors and interaction hash generated against the `@interledger/open-payments` 7.4.0 type definitions |
| `tap-to-pay-svc/scripts/` (`seed`, `grant-buyer`, `add-buyer`, `add-wallet`) | Claude Code | Generated from `SDD.md` section 10, step 3, and the multi-wallet design |
| `tap-to-pay-svc/tests/` | Claude Code | Generated alongside the code; covers the table in `SDD.md` section 13 |
| `prompts/` | Claude Code | The build prompts were written with Claude from the SDD and the code |

## Files with little or no AI involvement

| File / component | Notes |
| --- | --- |
| Test Wallet accounts, developer keys, grants and `.env` values | Created by hand and never shared with the AI |

## Prompts

The exact text of the coding prompts we kept as files is in [`prompts/`](prompts/):

- [`RAW_initial_prompt.txt`](prompts/RAW_initial_prompt.txt): SDD changes and scaffolding for both folders.
- [`backend-service.txt`](prompts/backend-service.txt): the build prompt for the first version of the service.
- [`remove-asset-mismatch.txt`](prompts/remove-asset-mismatch.txt): accept sales between wallets in different assets.

Commits made with Claude Code that carry the trailer `Co-Authored-By: Claude …` are listed by `git log --grep "Co-Authored-By: Claude"`.

## How we reviewed AI output

- AI-generated code was read and understood by at least one team member before being committed. Larger changes went in through pull requests with a summary and a test plan.
- **Service:** `npm run typecheck` and `npm test` (Vitest, against in-memory fakes of the database and the wallets) before committing.
- **App:** type checking, lint, and runs on the phones: Expo Go for the screens, development builds on Android for NFC.
- **Open Payments calls** were checked against the official documentation and the SDK's type definitions.
- **Still to verify:** a real charge end to end on the Test Wallet, and the two-phone NFC run from `SDD.md` section 13.
