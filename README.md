# Church Planning Buddy

MVP wizard to build a **Get Ready Guide** output Google Doc from a Planning Center plan: copy a Drive template, fill date + song list placeholders, append song scan bodies from org Drive (via PCO links). **Signoff required** before any writes.

See [`PRODUCT.md`](./PRODUCT.md) for the full spec and [`docs/GRG-TEMPLATE.md`](./docs/GRG-TEMPLATE.md) for template placeholders.

## Setup

```bash
cp .env.local.example .env.local
# Set PCO_BASIC_TOKEN, Google OAuth credentials, GRG_TEMPLATE_TITLE, GRG_OUTPUT_TITLE
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. **Connect Google** (Worship Leader account with read access to org scans + Drive/Docs write).
2. **Verify template** — default `Get Ready Guide (TEMPLATE)` with `{{GRG_DATE}}`, `{{GRG_SONG_LIST}}`, `{{GRG_SCANS_BEGIN}}`.
3. Set **output title** (default `Get Ready Guide (Good Friday)`).
4. Enter **Plan ID** (e.g. `87788328`) → per-song Drive resolution → **Preview** → **Approve** (recreates output from template).

OAuth tokens persist under `.data/google-tokens.json` (gitignored) for local MVP.

## API (MVP)

| Route | Purpose |
|-------|---------|
| `POST /api/mvp/plan` | PCO plan bundle (date, songs, keys, scan tiers) |
| `POST /api/mvp/candidates` | Resolve `blank` scan files from PCO Drive URL |
| `POST /api/mvp/scan-content` | Export selected file as text |
| `POST /api/mvp/find-grg` | Verify template + optional existing output |
| `POST /api/mvp/preview` | Preview payload before signoff |
| `POST /api/mvp/apply` | Copy template → output, fill placeholders, append scans |

## Re-consent Google

Scopes include `documents` and `drive` (copy/delete output, read template). After upgrading, use **Reconnect Google** on the setup step.
