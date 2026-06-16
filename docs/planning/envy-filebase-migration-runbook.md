# HP Envy filebase migration runbook (Phase 2)

**Status:** Ops checklist — run after Grapevine Rig Phase 1 (pair + Scan + Apply) is verified on the HP Envy TE01.

**Context:** Today the ProPresenter filebase on the Envy is mirrored to Google Drive via **Computers** backup under `tech%saddleback.de@gtempaccount.com` (~32 GB). The target architecture is a church **Shared drive** with selective pull — see [filebase-architecture.md](./filebase-architecture.md) and [filebase-migration-plan.md](./filebase-migration-plan.md).

---

## Prerequisites (Phase 1 complete)

- [ ] Grapevine Rig **v0.2.7+** installed and paired on the Envy
- [ ] **Scan now** succeeded; grapevineprep.com shows fresh library index
- [ ] Dry-run **Send → Apply** completed at least once
- [ ] M0 Shared drive layout exists (`1FG1w8LXfoSTQfjKZxsAv7735F0IukvMw` per [m0-drive-repoint.md](./m0-drive-repoint.md))

---

## Account ownership target

| Account | Role | When to use |
|---------|------|-------------|
| `tech@saddleback.de` | Future Owner/Org | When Workspace admin access is available — canonical church owner |
| `jesse@saddleback.de` | Interim operator (you have access) | Pairing, Shared drive Content manager, M0–M2 until `tech@` is live |
| `tech%saddleback.de@gtempaccount.com` | Legacy Computers sync | **Retire** after Filebase seed — do not add new content here |

---

## M0.3 — Stop legacy mirror sync (critical)

Whole-filebase **Computers** mirror sync caused past production failures (startup overwrite). Before seeding Shared drive `Filebase/`:

1. Confirm Shared drive `Filebase/` placeholders exist (see [m0-drive-repoint.md](./m0-drive-repoint.md) §5).
2. On the Envy, **pause or uninstall** Google Drive desktop sync for the gtemp account’s Computers backup of the ProPresenter library tree.
3. Keep a **local backup** of the Envy filebase (external drive or zip) before disabling sync.
4. Document the local ProPresenter bundle root path on the Envy (`PP_BUNDLE_ROOT` / Support Files location).

**Do not** copy the legacy sync DB folder (`1-1I9HY7af_a2FCRw8WmKceAuI50DLJlg`) into `Filebase/` until M2 readiness gate passes.

---

## M2 — Seed Filebase from rig

1. On the Envy, run **Scan now** in Grapevine Rig (fresh `pp_index_snapshots` in Supabase).
2. From a dev machine with Google tokens for `jesse@saddleback.de` (Content manager on Shared drive):

   ```bash
   cd church-planning-buddy
   npm run pp:bundle-scan    # or use rig scan output
   # M2 upload script when implemented — see filebase-migration-plan.md § M2
   ```

3. Verify `Filebase/Libraries`, `Filebase/Playlists`, and `Filebase/snapshots/` on Shared drive match rig inventory (metadata + hashes, not blind full copy).

---

## Shared drive membership

| Person | Shared drive role |
|--------|-------------------|
| Worship planners | Content manager |
| `jesse@saddleback.de` | Content manager (interim) |
| Future `tech@saddleback.de` | Manager (owner transfer when ready) |
| gtemp account | Remove after migration |

---

## M3–M5 (product work — not ops-only)

| Phase | Deliverable |
|-------|-------------|
| M3 | Publish bridge → `Services/{YYYY.MM.DD}/` packages |
| M4 | `filebase-pull.ts` + web zip download for remote prep |
| M5 | Grapevine Rig **Gameday pull** UI (Operator conflict resolution) |

Success tests from church vision:

- **Pull existing presentation onto rig** → M5
- **Build novel presentation on rig via Grapevine** → M4/M5 + PrezInit flow on web

---

## Verification checklist

- [ ] gtemp Computers sync disabled; local Envy backup retained
- [ ] `jesse@saddleback.de` (or `tech@`) is Content manager on Shared drive
- [ ] Rig index fresh in Supabase
- [ ] `Filebase/` seeded (M2) without legacy mirror re-enabled
- [ ] Sunday workflow still works: Send → Apply on Envy

---

## Related

- [INSTALL-GRAPEVINE-RIG.md](../INSTALL-GRAPEVINE-RIG.md)
- [multi-user-ops-and-shared-drive.md](./multi-user-ops-and-shared-drive.md)
- [scripts/envy-rig-setup.ps1](../../scripts/envy-rig-setup.ps1)
