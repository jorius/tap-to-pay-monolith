# 05 Pay a sale by QR or WhatsApp link

- When: 2026-10-16 23:20 COT · Tool: Claude Code, Claude Opus 5.5 · Who: Santiago
- Files: see below (branch `feat/qr-whatsapp-pay`, commit 952015b)
- Kept or changed: kept as generated after review; typecheck and tests green; not yet tried on the phones

## Prompt (verbatim)

````text
Session: QR and WhatsApp payment link (Claude Code, Claude Opus 5.5), Oct 16, 2026, ~23:20.

Context given before this prompt: the team's repo (SDD.md, tap-to-pay-svc, tap-to-pay-app) and the plan to add a QR fallback for phones without NFC.

Prompt (verbatim, Spanish):
sii porfa, haz el qr e intenta también el link de pago de whatsapp, sería fácil ese ? en una rama aparte

What was built from it (branch feat/qr-whatsapp-pay):
- Service: GET /pay/:id (mobile payment page; the buyer types their wallet address once, remembered on the phone, and the page calls the same POST /sales/:id/charge as the NFC tap), GET /sales/:id/qr.png (QR of that page), GET /sales/:id/pay-link (page URL plus a wa.me link with the message ready). Optional PUBLIC_URL; otherwise the base URL comes from the request (x-forwarded-proto/host honoured). Tests in tests/pay.test.ts.
- App: the vendor terminal shows the QR and a "Send the charge by WhatsApp" button while waiting; a phone without NFC (or with NFC off) can still create sales; while waiting, the sale is read every 2 s so a payment made from the link moves the screen to Paid.

Verification: npm run typecheck and npm test in tap-to-pay-svc (144 tests green); tsc and eslint on the changed app files. Not tested on phones.
````
