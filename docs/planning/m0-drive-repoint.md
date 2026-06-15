# M0 — Re-point Grapevine tools to new Drive layout

**Status:** Complete (2026-06-15) — env + production synced; Drive IDs verified via `jesse@saddleback.de` tokens.

---

## Drive folders (reference)

| Role | Folder ID | Access (jesse.delgadillo19) | Use |
|------|-----------|------------------------------|-----|
| **New Grapevine layout** (GRG + handoff) | `1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw` | Write (church account) | **Active** — point all tool env vars here |
| **Legacy PP sync database** | `1-1I9HY7af_a2FCRw8WmKceAuI50DLJlg` | Read-only (security) | **Do not write** — reference / compare only; retire when filebase seed complete |

Legacy folder: [open in Drive](https://drive.google.com/drive/folders/1-1I9HY7af_a2FCRw8WmKceAuI50DLJlg)

New layout root: [open in Drive](https://drive.google.com/drive/folders/1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw)

---

## What gets re-pointed

| Tool | Env vars | Behavior unchanged |
|------|----------|-------------------|
| **GRG** | `GRG_TEMPLATE_FOLDER_ID`, `GRG_OUTPUT_FOLDER_ID`, `GRG_TEMPLATE_ID` | Apply still copies template → dated output |
| **Slide deck publish** | `PP_PLAYLISTS_FOLDER_ID`, `PP_NEW_FILES_FOLDER_ID` | Rig publish still writes service packages |
| **Song scans** | PCO scan paths (if env-scoped) | Unchanged if scans stay in copy tree |

**Not re-pointed in M0:** `Filebase/` (empty until M2 seed), `Services/` (M3).

---

## Steps

### 1. Connect Google with a **write-capable** church account

GRG Apply and publish need **Content manager** (Shared drive) or **Editor** on the new layout folder. Read-only access (personal account on legacy folder) is insufficient for Apply.

Use the same account you will use on grapevineprep.com for production planners.

### 2. Resolve folder IDs under the new layout root

```bash
cd church-planning-buddy

# Inspect top-level folders if resolve fails:
npm run drive:layout-list -- 1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw

# Resolve GRG + PP handoff IDs:
npm run drive:layout-resolve -- --parent 1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw
```

Paste printed lines into `.env.local`.

### 3. Local smoke tests

| Tool | Test |
|------|------|
| GRG | `/grg` → Diagnose Drive → Apply one plan date |
| Slide deck | `/slide-deck` → preview → submit (optional Send) |

### 4. Production (grapevineprep.com)

Update Cloudflare Worker secrets with the **same** folder IDs:

```bash
npm run env:cf
```

Set at minimum: `GRG_TEMPLATE_FOLDER_ID`, `GRG_OUTPUT_FOLDER_ID`, `GRG_TEMPLATE_ID`, `PP_PLAYLISTS_FOLDER_ID`, `PP_NEW_FILES_FOLDER_ID`, and optionally `GV_DRIVE_LAYOUT_ROOT_FOLDER_ID`.

Redeploy if required by your hosting workflow.

### 5. Create empty placeholders (same Shared drive)

Sibling to GRG content (for future phases). Created under layout root `1FG1w8LX…`:

```text
Filebase/          → 1RmbbnIHryh8I_3wLLOj4g2SMJTRMIlcb
Filebase/snapshots → 1ljZ-O138L45JweLI-dpSKn06TL06YZWd
Services/          → 1qGReAqnxGuu_Na9fYNUPDJ5QsIbxJ9Vb
```

Or run: `npx tsx scripts/create-m0-placeholder-folders.ts` (requires valid Google tokens).

Do **not** copy legacy sync DB (`1-1I9HY7…`) into `Filebase/` until M2 readiness gate.

---

## Path walk vs folder IDs

Grapevine resolves folders by **ID first**, then by path walk from Drive root (`church-planning-buddy/Get Ready Guide/...`).

After re-pointing, **prefer folder IDs** from the resolve script. Path env vars can stay for documentation but IDs take precedence.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| GRG Diagnose 403 | Use church account with Content manager on layout root |
| Resolve script finds no GRG folders | Run `--list`; adjust folder names in copy to match `Get Ready Guide/Template` |
| Apply works locally, fails on production | `env:cf` + redeploy; confirm Worker has new IDs |
| Still writing to old personal Drive | Clear stale IDs in Worker secrets |

---

## Related

- [filebase-migration-plan.md](./filebase-migration-plan.md) — full M0–M5
- [multi-user-ops-and-shared-drive.md](./multi-user-ops-and-shared-drive.md) — Shared drive membership
- [HOSTING-GRAPEVINE.md](../HOSTING-GRAPEVINE.md) — deploy + auth
