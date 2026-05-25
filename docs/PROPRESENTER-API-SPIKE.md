# ProPresenter 21.3 — API spike (Phase 0)

**Status:** Complete on operator Mac (2026-05-25)  
**Spec:** [`PROPRESENTER-MVP.md`](./PROPRESENTER-MVP.md)  
**Setup:** [`PROPRESENTER-API-SETUP.md`](./PROPRESENTER-API-SETUP.md)

---

## Environment

| Field | Value |
|-------|--------|
| ProPresenter version | 21.3 |
| Transport | **TCP JSON** (`PP_TRANSPORT=tcp`) — HTTP on TCP port returns `HPE_INVALID` |
| TCP/IP Port ID (`PP_PORT`) | **64509** |
| Network tab port (`PP_NETWORK_PORT`, optional) | **64496** (IP 192.168.0.40) |
| Host | `127.0.0.1` (same Mac as ProPresenter) |
| Probe date | 2026-05-25 |

**Wire format:** Line-delimited JSON per [RV TCP/IP API](https://support.renewedvision.com/hc/en-us/articles/31606866768147). CPB `src/lib/propresenter/tcp-transport.ts` + `client.ts` (`auto` tries HTTP then TCP).

---

## Public API (documented)

Source: [openapi.propresenter.com](https://openapi.propresenter.com/).

| Capability | Documented? | Operator rig |
|------------|-------------|--------------|
| List libraries | Yes | ✓ `v1/libraries` → 8 libraries |
| Enumerate library items | Yes | ✓ `v1/library/{uuid}` → 52 items (Import library sample) |
| Presentation detail | Yes | ✓ `v1/presentation/{uuid}` |
| List / create playlists | Yes | ✓ 6 playlist roots |
| Arrangement **select** by name | **No dedicated endpoint** | Data on presentation: `arrangements`, `current_arrangement` |
| Arrangement **duplicate** | **No** | Not in OpenAPI |
| Arrangement **create** | **No** | Not in OpenAPI |
| Arrangement **tile reorder** | **No** | Not in OpenAPI |

---

## Probe results (2026-05-25)

```bash
npm run pp:status   # OK with PP_TRANSPORT=tcp
npm run pp:probe
```

### Libraries (8)

| index | name | uuid |
|-------|------|------|
| 0 | Import | `C678583E-4A96-46FA-835E-E2CDF1ECF08F` |
| 1 | Default | `AC033DA0-9B51-4D79-A18D-29ADE41D8745` |
| 2 | Lyric Screens | `75AC6041-E1DB-4D0E-AE0B-A73757FCDC32` |
| 3 | Guest Library | `7919E769-9F8F-4D0B-B525-3CCD8639BFC5` |
| 4 | Service Order | `CE3DF852-F69A-4731-9D03-BED2E7601D7C` |
| … | (3 more) | (see probe JSON) |

**Index builder:** Prefer **Default** or **Service Order** library for song matching; avoid using Import-only for production index.

### Library items

- First library probed: **Import** (`C678583E-…`) — **52** items.
- Item rows expose presentation **uuid** (used for `GET v1/presentation/{uuid}`).
- Sample presentation probed: `89A846F2-E19E-45DC-9981-1166505AE0C3`.

### Presentation detail — arrangement-related paths

From probe `presentation_detail` notes:

- `presentation.arrangements`
- `presentation.current_arrangement`
- `presentation.groups`

**Implication for Phase 1–2:**

- Matcher can load arrangements from `presentation.arrangements` and compare GRG structure to `groups` / cue labels.
- “Select LIVE” likely means set **`current_arrangement`** (or equivalent) when adding to playlist — **spike write test** still needed with `PP_ALLOW_WRITES=true` on a throwaway playlist only.
- Tile reorder remains **out of scope** (no API).

### Open questions (deferred to write spike)

1. Does playlist item POST accept `arrangement` name/id to select LIVE vs MASTER?
2. Can `current_arrangement` be set via PUT on presentation without destructive side effects? (**Do not test on Sunday deck**.)
3. Full shape of `groups` vs GRG section labels — capture one song JSON with `npm run pp:probe -- --uuid <uuid> --json` when tuning matcher.

---

## Safety checklist (Phase 0)

- [x] `PP_ALLOW_WRITES=false` in normal dev
- [x] Probe uses GET only (via TCP transport)
- [x] No writes against production Sunday playlist
- [ ] Write spike: new playlist name with date prefix only (`CPB Spike YYYY-MM-DD`)
- [x] Abort rule documented: wrong `playlist_id` / `uuid` → no PUT

---

## Decisions for Phase 1

| Topic | Decision |
|-------|----------|
| Transport | **`PP_TRANSPORT=tcp`** on operator Mac (port 64509) |
| Match input | `GET v1/library/{id}` + `GET v1/presentation/{uuid}` |
| Arrangement automation | Read `arrangements` / `current_arrangement` / `groups`; flag **NEEDS_ARRANGEMENT**; no tile reorder |
| First write endpoint | `POST v1/playlists` after signoff only (allowlist in `safety.ts`) |
| Next build step | **PR1:** `worship-plan` manifest + dry-run preview (zero PP writes) |

---

*Last updated: 2026-05-25*
