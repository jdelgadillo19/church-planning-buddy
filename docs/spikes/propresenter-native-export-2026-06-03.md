# Spike: ProPresenter native playlist export vs CPB handoff

**Date:** 2026-06-03  
**ProPresenter:** 21.x (operator Mac)  
**Support files:** `/Users/SBBWD/Documents/ProPresenter`

## Findings

| Artifact | First bytes | `file` | Size (example) |
|----------|-------------|--------|----------------|
| Internal `Playlists/Library` | `0a1d 0801…` (protobuf) | data | 13,443 |
| Native **File → Export → Playlist** (`SUN 2026.06.07.proplaylist`) | `0a1d 0801…` (protobuf) | data | 13,443 |
| CPB publish inner file (bug) | Same header as `Library` | data | 13,443 — **wrong document** |

- Native `.proplaylist` on PP 21.3 is **not** a PK zip (`unzip -t` fails). Import’s “error unzipping files” on CPB output was likely **wrong playlist document** (whole `Library` tree file), not “missing zip wrapper.”
- Native export and `Library` can be **same size but different bytes** (`cmp` differs at char 11241).
- Service playlist `SUN 2026.06.07` lives **inside** the `Library` playlist document (grep shows name + UUID in that file), not as a separate file under `Playlists/`.

## Conclusion

Publish must use **File → Export → Playlist** (or drag playlist to folder), not a blind read of `Playlists/*` by UUID/name match.

## Import UX (operator)

1. Download transport `.zip` from Drive.
2. Unzip once → get `{playlist}.proplaylist`.
3. In ProPresenter: **File → Import** → select that `.proplaylist` (do not unzip the `.proplaylist` in Finder).

## Automation note

No REST export endpoint. macOS automation: menu **File → Export → Playlist** or drag playlist name to staging folder (see `scripts/propresenter/export-playlist.applescript`).
