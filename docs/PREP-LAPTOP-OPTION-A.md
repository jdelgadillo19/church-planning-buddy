# Prep laptop — Option A (grapevineprep.com + local ProPresenter)

**Your setup:** Same Mac runs ProPresenter and a browser. You use **grapevineprep.com** for planning; a **local companion** on this machine for Download and Upload.

Cloudflare cannot reach `127.0.0.1` ProPresenter, so Download/Upload **cannot** run on grapevineprep.com alone. The companion is a local dev server on this laptop only.

---

## One-time on this Mac

1. Clone/update `church-planning-buddy` and `npm install`.
2. Copy `.env.local` (or use the repo’s existing one) with:
   - Supabase + PCO + Google (same as prod)
   - `PP_HOST=127.0.0.1`, `PP_PORT=<your TCP port>`, `PP_TRANSPORT=tcp`
   - `PP_ALLOW_WRITES=true`
3. ProPresenter → Settings → Network → **Enable Network** ON.
4. Sign in to Supabase on **both** grapevineprep.com and `http://127.0.0.1:3000` (add `http://127.0.0.1:3000/auth/callback` in Supabase redirect URLs if needed).

---

## Each prep session

### Part 1 — Browser planner (grapevineprep.com)

1. Open https://grapevineprep.com/slide-deck and sign in.
2. Pick the **weekend**.
3. Check **Weekend presentations** (green/yellow handoffs) or **Build fresh**.
4. Click **Create Presentation** — fix missing songs / library picks.
5. Optional: **Pull filebase files** (needs Filebase seeded on Drive).
6. Leave this tab open for reference; you do **not** Download here.

### Part 2 — Prep companion (this Mac)

1. In Terminal, from `church-planning-buddy`:

   ```bash
   npm run prep:companion
   ```

2. Open **http://127.0.0.1:3000/slide-deck** and sign in (same church account).
3. Pick the **same weekend**.
4. **Create Presentation** again (same cloud index; quick).
5. **3. Download presentation** → confirm playlist in ProPresenter.
6. Edit in ProPresenter.
7. **Open upload tool** → **Upload complete** or **Upload incomplete**.

### Part 3 — Verify (still on grapevineprep.com)

1. Refresh grapevineprep.com slide-deck for that weekend.
2. **Weekend presentations** should show your upload (green or yellow).
3. Hosted panel may show **Pending rig handoffs** when Services publish is configured.

---

## Quick checks

| Command | Purpose |
|---------|---------|
| `npm run pp:diagnose` | ProPresenter reachable from this Mac |
| `npm run pp:inspect-index` | Cloud filebase index (template + library counts) |
| `npm run pp:index-upload` | Refresh cloud index from this Mac's ProPresenter |
| `npm run handoff:verify-migration` | Handoff DB columns exist |
| `npx tsx src/lib/slide-deck/handoff.test.ts` | Handoff sort logic |

### "Sundays Template was not found in the filebase"

Create Presentation uses the **cloud index** on grapevineprep.com and (after the hosted fix) can use **local ProPresenter** on the prep companion.

1. Run `npm run pp:inspect-index` — if library items are **0** or template `sourceFound: false`, refresh the index:
   - **From this Mac:** `npm run pp:index-upload` (ProPresenter running, same template name as `PP_TEMPLATE_PLAYLIST_NAME`)
   - **From sanctuary rig:** Grapevine Rig → **Scan now**
2. Restart `npm run prep:companion` after pulling code changes so local PP is detected.
3. Confirm `PP_TEMPLATE_PLAYLIST_NAME` matches the playlist in ProPresenter (default: `Sundays Template`).

---

## Deferred until presentation rig

- **Scan now** (fresher index)
- **filebase:seed-upload**
- **Import handoff** on Grapevine Rig
- **Send to rig → Apply**

Uploads from the prep laptop are stored in Supabase (and Drive when configured) until the rig imports them.
