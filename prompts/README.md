# Prompt log

The coding prompts we sent to AI tools during the event, one file per prompt, in the order sent, following the convention in [SDD.md section 17](../SDD.md#17-ai-usage-declaration): the prompt verbatim, when, who, which tool, the files it touched and what we kept or changed.

| # | File | When (Oct 16, COT) | Who | What it produced |
| --- | --- | --- | --- | --- |
| 01 | [01-initial-scaffold.md](01-initial-scaffold.md) | 11:39 | Jorius | SDD changes and the scaffolding of both folders |
| 02 | [02-backend-service.md](02-backend-service.md) | 12:25 | VictorJVA | The first version of the service |
| 03 | [03-remove-asset-mismatch.md](03-remove-asset-mismatch.md) | 13:32 | VictorJVA | Sales between wallets in different assets |
| 04 | *missing* | 14:05–22:49 | Jorius | The UI/UX redesign and the service logging (commits 0052c6c, 27a62b2): **add `04-ui-redesign.md` with the prompts used** |
| 05 | [05-qr-whatsapp-pay.md](05-qr-whatsapp-pay.md) | 23:20 | Santiago | Paying a sale by QR or WhatsApp link |
| 06 | [06-submission-docs.md](06-submission-docs.md) | 23:45 | Santiago | This README, the SDD clean-up, the AI usage file, the TypeScript fix |

Add one file per new prompt as you go: `NN-<slug>.md`, next number, same headings.
