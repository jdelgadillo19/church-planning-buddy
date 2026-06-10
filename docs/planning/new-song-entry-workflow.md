# New Song Entry — Operator Workflow (v1)

When Planning Center includes a song that is **not** in the ProPresenter library index, Grapevine Prep blocks **Submit draft** and **Send to rig** until the gap is resolved.

## Recommended workflow (manual add + scan)

1. **Planner** loads commit preview on grapevineprep.com and sees **Songs missing from ProPresenter library** (red panel) plus preview warnings.
2. **Rig operator** adds the song to the ProPresenter library on the presentation rig:
   - **Path A (preferred when SongSelect is configured):** In ProPresenter, import from **SongSelect** (CCLI). Search by song title or **CCLI #** from Planning Center if shown. Import into the library, then create or select **MASTER** / **LIVE** per church SOP. Grapevine does not automate SongSelect import in v1 — this is a manual rig step.
   - **Path B:** Duplicate an existing presentation template or build **MASTER** from org scan / GRG reference docs.
   - **Path C:** New blank presentation when neither SongSelect nor a reference doc applies.
3. In **Grapevine Rig** → **Scan now** (uploads updated library index).
4. **Planner** hard-refreshes preview on grapevineprep.com — song should show **Found** in playlist preview.
5. **Submit draft** / **Send to presentation rig** when no missing or ambiguous songs remain.

## Why we do not auto-skip missing songs

Skipping a row writes fewer playlist items than the commit preview. That caused verify failures (expected 9 items, ProPresenter had 8) and shifted positions. Apply now **fails fast** with a clear message naming the missing song.

Optional escape hatch for advanced/dev use only: set `PP_ALLOW_PARTIAL_APPLY=true` on the rig worker environment to allow skip + verify against written items only.

## Deferred options (not v1)

| Approach | Notes |
|----------|--------|
| Placeholder playlist row | Preserves order but wrong content until fixed — confusing for operators |
| PCO → ProPresenter import API | No safe public API for full song creation today |
| Automated SongSelect / CCLI import | Manual Path A on rig today; matcher may use CCLI # in a future phase |
| In-app "request new song" task | Future: notify WD with PCO title + key |

## Related docs

- [`INSTALL-GRAPEVINE-RIG.md`](../INSTALL-GRAPEVINE-RIG.md) — Scan now, apply retry
- [`SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md`](SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md) — submission / implementation plan flow
