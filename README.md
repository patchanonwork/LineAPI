# LINE Gatekeeper Bot — v2.1 (contact buttons per spec)

### What’s in this version
- **Contact Flex ("ติดต่อคุณณณ")** with buttons:
  - โทรหา (เร่งด่วน/ติดต่อไม่ได้) → tel://<CONTACT_PHONE>
  - อีเมล → mailto:Patchanon.work@gmail.com (override with CONTACT_EMAIL)
  - รอการตอบกลับข้อความ → sends message to bot and triggers admin notification
- **No LIFF button** in the contact card
- **Notifications** to you (LINE push to ADMIN_GROUP_ID/ADMIN_USER_ID and/or email via SMTP)
- **Gencode 37 days = FREE** (treated like 30d)

## Setup
1) Add env vars (Cloud Run or .env):
```
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
CONTACT_PHONE=+66XXXXXXXXX
CONTACT_EMAIL=Patchanon.work@gmail.com
ADMIN_GROUP_ID=   # if you have a LINE group with the bot
ADMIN_USER_ID=    # fallback personal LINE userId
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
NOTIFY_EMAIL_TO=alerts@example.com
```
2) Deploy to Cloud Run (Buildpacks) and set webhook to https://<service>/webhook.

## How it behaves
- If a user sends **"ติดต่อคุณณณ"**, bot replies with the contact Flex and notifies admin.
- If they tap **"รอการตอบกลับข้อความ"**, bot acknowledges and notifies admin again.
- You’ll receive alerts via LINE push and/or email (if configured).

## Pricing summary (unchanged)
- Base by Format A/B × IG/TT/Dual × Single/Bundle3
- Asset: 1m +15% • 3m +20% • 6m +30% • Permanent +50%
- Gencode: 30d FREE • 90d +5% • 180d +10% • **37d FREE**
- Exclusivity: +15%/month (cap 2) • Rush (<7d): +10% • Health premium: +฿20,000
