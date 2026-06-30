# Prep laptop — Grapevine Prep desktop app

**Volunteer setup:** Install **Grapevine Prep** from [grapevineprep.com/login](https://grapevineprep.com/login) (Windows or macOS). No terminal required.

**Legacy dev path:** `npm run prep:companion` → http://127.0.0.1:3000/slide-deck (developers only).

Cloudflare cannot reach `127.0.0.1` ProPresenter, so Download/Upload **cannot** run on grapevineprep.com alone. Use the **Grapevine Prep** app on a laptop with ProPresenter installed.

---

## One-time on prep laptop

1. Install **Grapevine Prep** from grapevineprep.com (or build with `npm run prep:build`).
2. Install **Node.js 20+** (required for the embedded local server).
3. ProPresenter → Settings → Network → **Enable Network** ON.
4. Sign in on **both** grapevineprep.com and Grapevine Prep (same church account).

---

## Each prep session

### Part 1 — Browser planner (grapevineprep.com)

1. Open https://grapevineprep.com/slide-deck and sign in.
2. Pick the **weekend**.
3. Check **Weekend presentations** or **Build fresh**.
4. **Create Presentation** — fix missing songs / library picks.
5. Optional: **Pull filebase files**.
6. Do **not** Download here.

### Part 2 — Grapevine Prep

1. Open **Grapevine Prep**.
2. Pick the **same weekend**.
3. **Create Presentation** again.
4. **Download presentation** → confirm playlist in ProPresenter.
5. Edit in ProPresenter.
6. **Upload complete** or **Upload incomplete**.

### Part 3 — Verify on web

1. Refresh grapevineprep.com slide-deck.
2. **Weekend presentations** shows your upload.
3. Admin: sign off for rig delivery when complete.

Full chain: [`OPERATIONAL-WALKTHROUGH.md`](./OPERATIONAL-WALKTHROUGH.md).

---

## Quick checks (developers)

| Command | Purpose |
|---------|---------|
| `npm run operational:verify` | Env readiness |
| `npm run pp:inspect-index` | Cloud filebase index |
| `npm run handoff:verify-migration` | Handoff DB columns |

### "Sundays Template was not found in the filebase"

1. Run `npm run pp:inspect-index` — if library items are **0**, refresh index from sanctuary rig **Scan now**.
2. Confirm `PP_TEMPLATE_PLAYLIST_NAME` matches ProPresenter.
