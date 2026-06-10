# Church Planning Buddy

MVP wizard to build a **Get Ready Guide** output Google Doc from a Planning Center plan: copy a Drive template, fill date + song list placeholders, append song scan bodies from org Drive (via PCO links). **Signoff required** before any writes.

See [`docs/STARTUP-GUIDE.md`](./docs/STARTUP-GUIDE.md) to **resume slide-deck / Grapevine Prep / rig work** (deploy, Sunday workflow, key paths).  
See [`docs/PROJECT-STATUS.md`](./docs/PROJECT-STATUS.md) for GRG MVP status and long-range handoff.  
Spec: [`PRODUCT.md`](./PRODUCT.md). Template: [`docs/GRG-TEMPLATE.md`](./docs/GRG-TEMPLATE.md).

## Setup

```bash
cp .env.local.example .env.local
# Set PCO_BASIC_TOKEN, Google OAuth credentials, GRG_TEMPLATE_TITLE, GRG_OUTPUT_TITLE
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on the machine where you ran `npm run dev` (not another device on your LAN).

**Slide Deck → Drive:** After commit preview, use **Publish to Drive** or `npm run slide-deck:publish -- <planId>`. See [`docs/PROPRESENTER-PUBLISH.md`](./docs/PROPRESENTER-PUBLISH.md).

### Local dev troubleshooting

- Run commands from this directory (`church-planning-buddy/`), not the parent `Projects/` folder.
- After changing Next config, clear the dev cache if needed: `rm -rf .next`
- A stray `~/package-lock.json` can confuse Next’s workspace detection. If Turbopack fails to resolve `tailwindcss`, rename it: `mv ~/package-lock.json ~/package-lock.json.bak`
- Do **not** set `turbopack.root` to this app directory in `next.config.ts` (Next.js [#90307](https://github.com/vercel/next.js/issues/90307) breaks Tailwind `@import` resolution).
- If `npm run dev` (Turbopack) still fails: `npm run dev:webpack`

1. **Connect Google** (Worship Leader account with read access to org scans + Drive/Docs write).
2. **Verify template** — default `Get Ready Guide (TEMPLATE)` with `{{GRG_DATE}}`, `{{GRG_SONG_LIST}}`, `{{GRG_SCANS_BEGIN}}`.
3. Set **output title** (defaults to `Get Ready Guide YYYY.MM.DD` after plan load).
4. Select the upcoming **Plan** by date (scoped to the configured/user campus; the next Berlin Sunday service is preselected) → Drive resolution → **Preview** → **Approve** (recreates output from template) → optional **Post PDF to Planning Center** on the plan item titled **Get Ready Guide**.

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
| `POST /api/mvp/export-grg` | Export output doc as PDF and upload to PCO Get Ready Guide item |

## Re-consent Google

Scopes include `documents` and `drive` (copy/delete output, read template). After upgrading, use **Reconnect Google** on the setup step.
