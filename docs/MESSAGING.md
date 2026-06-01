# Team Messaging (v1 — draft forward)

**Default flow (`draft_forward`):** CPB builds the message from your Google Sheet + PCO context, delivers a **draft to you** headlessly, and you **forward** it into the WhatsApp group. No GUI session required for the scheduled step.

```text
8:00 launchd → health + build message → draft to you → you forward to group
```

Legacy **`whatsapp_desktop`** still posts via AppleScript when logged in.

## Delivery modes

| Mode | Scheduled step | Group post |
|------|----------------|------------|
| `draft_forward` (default) | Headless prepare + draft delivery | **You** forward manually |
| `whatsapp_desktop` | Needs GUI | AppleScript auto-post |

## Draft delivery channels (tried in order)

1. **WhatsApp Cloud API** → your phone (`WHATSAPP_CLOUD_*`, `MESSAGING_OWNER_PHONE_E164`)
2. **Webhook** → Pushcut/IFTTT (`MESSAGING_DRAFT_WEBHOOK_URL`)
3. **macOS notification** (logged-in user, no WhatsApp Desktop)
4. **CPB pending file** → `.data/messaging-pending/{workflowId}.json` + `/messaging` UI

Failures use **macOS notifications**, not WhatsApp Desktop alerts.

## Environment (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `MESSAGING_SHEET_ID` | CPB Message Library |
| `MESSAGING_CALENDAR_ID` | `[CPB]` calendar mirror |
| `PCO_OWNER_PERSON_ID` | Default `AC114173152` (away context) |
| `PCO_DEFAULT_PLAN_ID` | Resolves service type |
| `WHATSAPP_CLOUD_TOKEN` | Meta Graph API token |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | Business phone number ID |
| `MESSAGING_OWNER_PHONE_E164` | Your phone (digits, country code, no +) |
| `MESSAGING_DRAFT_WEBHOOK_URL` | Optional JSON webhook |
| `MESSAGING_ALERT_GROUP` | Legacy desktop mode only |

Reconnect Google after scope changes (Sheets + Calendar).

## Message sheet

Tab `Messages`:

```text
Group | Purpose | Context | Variant | Message | Additional | Enabled
Saddleback Berlin Worship Community | Signup Reminder | normal | A | … | | TRUE
```

## CPB UI (`/messaging`)

1. **Prepare & deliver draft** — scheduled-equivalent run
2. **Copy message** / read pending draft
3. **Mark forwarded** — clears pending queue
4. **Post via desktop (optional)** — AppleScript to group when GUI available

## CLI / launchd

```bash
# Scheduled (headless-safe) — prepare + deliver draft
npm run messaging:run -- --workflow saddleback-signup-reminder

# Optional: post to group via WhatsApp Desktop when logged in
npm run messaging:run -- --workflow saddleback-signup-reminder --confirm
```

Example `launchd` (Thu 8:00):

```xml
<key>StartCalendarInterval</key>
<dict>
  <key>Weekday</key><integer>4</integer>
  <key>Hour</key><integer>8</integer>
  <key>Minute</key><integer>0</integer>
</dict>
```

Program: `cd …/church-planning-buddy && npm run messaging:run -- --workflow saddleback-signup-reminder`

## WhatsApp Cloud API setup (recommended)

1. [Meta Developer](https://developers.facebook.com/) → WhatsApp Business app
2. Add a test/production recipient (your phone)
3. Copy **Phone number ID** and **permanent token**
4. Set env vars; free-form text works inside 24h user-initiated window, else use an approved template

## Config

`.data/messaging-config.json` — workflows default to `deliveryMode: "draft_forward"`, Thu 8:00.

## Logs

`.data/messaging-send-log.jsonl`
