# AI Usage

## Tools used

| Tool | Model / plan | Used by | What we used it for |
| --- | --- | --- | --- |
| _e.g. Claude Code_ | _e.g. Claude Opus_ | _name_ | _Frontend components, debugging_ |
| Claude Code | Claude Opus 5.5 | Santiago | QR and WhatsApp payment link (branch `feat/qr-whatsapp-pay`) |
| | | | |
| | | | |

## Where AI was used

List specific files, functions or components. If AI helped with every file, say so here.

| File / component | Tool | How AI was used |
| --- | --- | --- |
| _e.g. `src/components/PaymentStatus.tsx`_ | _Claude Code_ | _Generated first version, edited by hand_ |
| `tap-to-pay-svc/src/services/pay.ts`, `src/routes/pay.ts`, `tests/pay.test.ts`; wiring in `app.ts`, `config.ts`, `server.ts` | Claude Code | Generated the payment page, the QR and pay-link endpoints and their tests (prompt: `prompts/qr-whatsapp-pay.txt`) |
| `tap-to-pay-app/src/hooks/use-sale.ts`, `src/app/vendor/(tabs)/sale.tsx`, `src/api/client.ts`, `src/api/types.ts` | Claude Code | Generated the QR and WhatsApp options on the vendor terminal, sales without NFC, and the polling that follows a sale paid from the link |
| | | |
| | | |

## Files with little or no AI involvement

| File / component | Notes |
| --- | --- |
| _e.g. `src/lib/open-payments.ts`_ | _Written by hand from the Open Payments docs_ |
| | |

## Prompts

The exact text of every coding prompt is in [`prompts/`](prompts/), one file per session. See [prompts/README.md](prompts/README.md) for the format.

## How we reviewed AI output

All AI-generated code was read, tested and understood by at least one team member before being committed. We checked Open Payments calls against the official documentation and the Node SDK.
