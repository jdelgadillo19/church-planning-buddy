# Get Ready Guide — Google Doc template

Church Planning Buddy copies this document each apply. **Do not edit the template during a run** — only the output doc is written.

## Create the template (one-time)

**Pre-formatted source:** [`downloads/Get Ready Guide (TEMPLATE).docx`](../downloads/Get%20Ready%20Guide%20(TEMPLATE).docx) was generated from `Get Ready Guide (SUN).docx` via `scripts/apply-grg-template-format.py`. Upload that file to Google Drive as a native Google Doc named **`Get Ready Guide (TEMPLATE)`**.

1. Or duplicate your working GRG into a new Google Doc named **`Get Ready Guide (TEMPLATE)`** (or set `GRG_TEMPLATE_TITLE` / `GRG_TEMPLATE_ID` in `.env.local`).
2. Insert these **literal** placeholders (plain ASCII, no smart quotes):

| Placeholder | Where |
|-------------|--------|
| `{{GRG_DATE}}` | Own paragraph directly under the title |
| `{{GRG_SONG_LIST}}` | Single paragraph where the bulleted song list should go (bullets can be applied to this paragraph in the template) |
| `{{GRG_SCANS_BEGIN}}` | Own paragraph immediately after the intro page break (before any sample scan content) |
| `{{STYLE_TITLE}}` `{{STYLE_CREDIT}}` `{{STYLE_BAR}}` `{{STYLE_LABEL}}` `{{STYLE_LYRIC}}` | One styled exemplar paragraph each, after `{{GRG_SCANS_BEGIN}}`, grouped into a single-column section (title/credit) and a two-column section (bar/label/lyric) — see **Scan style exemplars** below |

3. Remove broken date text (e.g. `AMay 24th, 2026`) — the app replaces `{{GRG_DATE}}` from PCO.
4. Keep roster / stage layout / team blocks **above** `{{GRG_SONG_LIST}}`.
5. Roster slots use **one placeholder line per section** (BAND and CHOIR), not fixed position names from the reference doc:

   `[Name | First-name Last Initial]: [Position]`

   On apply, **confirmed PCO team members** on **Platform Team** replace the entire roster block in each BAND / CHOIR section (`Timothy K.: Cajon`, etc.). Section is determined by the position prefix (`BAND - …`, `CHOIR - …`); **Guests** require choosing BAND or CHOIR in the app before preview/apply. Position labels come from PCO (`team_position_name`, with optional alias map in [`docs/roster-position-map.json`](./roster-position-map.json)).

   Regenerate template roster placeholders from SUN:

   `python3 scripts/apply-grg-template-format.py downloads/Get\ Ready\ Guide\ \(SUN\).docx downloads/Get\ Ready\ Guide\ \(TEMPLATE\).docx`

   **MVP scope:** Only **Platform Team** worship roles are written to the GRG (PCO teams `BAND`, `CHOIR`, `ALL TEAM` by default). Other teams (FOH, Greeter, etc.) are ignored. Override with `GRG_ROSTER_TEAM_NAMES` or `GRG_ROSTER_TEAM_IDS` in `.env.local`.

   **Sync catalog from PCO:** `npm run sync:roster-map -- --plan-id=YOUR_PLAN_ID` (or `--service-type-id=`). New positions discovered on plan load are appended automatically; use the Songs-step **Position aliases** panel to save overrides. Unconfigured `[ALIAS]` entries use the PCO position name with `BAND -` / `CHOIR -` prefix removed — never the literal `[ALIAS]` in the guide.

6. Do not put placeholders inside tables or images.

## Scan style exemplars (`{{STYLE_*}}`)

Scan-section formatting is **template-driven**. After `{{GRG_SCANS_BEGIN}}`, the template holds one styled exemplar paragraph per scan line type. On apply, the engine reads each exemplar's run style, removes the exemplars, then inserts **plaintext** scan content that adopts the matching style. **Edit these paragraphs in the Drive template to restyle all scans — no code change.**

| Token | Applies to | Golden style |
|-------|-----------|--------------|
| `{{STYLE_TITLE}}` | Song title (header) | 14pt bold |
| `{{STYLE_CREDIT}}` | `By:` / `©` / `CCLI …` lines | 9pt, Helvetica Neue |
| `{{STYLE_BAR}}` | Bar / interlude / instrumental markers (`4 Bar Intro …`) | 12pt bold, red `#FF0000` |
| `{{STYLE_LABEL}}` | Section labels (`VERSE 1: …`, `CHORUS: … + All`) | 12pt bold, yellow highlight |
| `{{STYLE_LYRIC}}` | Lyric body lines (and the trailing `END`) | 12pt regular |

Each scan source line is classified by type (bar markers start with `N Bar `; labels start with `VERSE/CHORUS/BRIDGE/PRE-CHORUS/INTRO/TAG/OUTRO/CODA`; the header's first line is the title, the rest are credits; everything else is a lyric) and styled from the matching token. The source scan's own fonts/colors are **discarded**.

### Column layout is template-driven

The engine also reads the **column layout of the section each `{{STYLE_*}}` exemplar sits in** and reuses it for that line type. In the generated template the exemplars are grouped into two sections:

- **Single-column section:** `{{STYLE_TITLE}}`, `{{STYLE_CREDIT}}` → each song header.
- **Two-column section:** `{{STYLE_BAR}}`, `{{STYLE_LABEL}}`, `{{STYLE_LYRIC}}` → the lyrics block.

When a song is written, the engine creates an explicit single-column header section (title + credits + a full-width divider rule it draws itself) and a two-column lyrics section, using the captured column layouts. The lyrics block never cycles between one and two columns, and reverts to single column at the next song's header (each song starts on a fresh page via a `NEXT_PAGE` section break). The intro page stays single-column. **This is manually configurable:** change a `{{STYLE_*}}` exemplar's containing section to 1 or 2 columns in the Google Doc and the next run's scans follow it (header layout from the title/credit section, lyrics layout from the bar/label/lyric section).

The structural inserts use `endOfSegmentLocation` and styling is applied from re-read indices, so no document positions are predicted (an earlier version hand-computed indices across section breaks, which failed and silently fell back to unstyled plain text).

Run `scripts/apply-grg-template-format.py` (see below) to regenerate these exemplars and their column sections; missing tokens are non-blocking (the engine falls back to the golden defaults above — single-column header, two-column lyrics — and surfaces a warning).

## Output document

Each **Approve** run:

1. Trashes any existing doc named **`GRG_OUTPUT_TITLE`** (default: `Get Ready Guide (Good Friday)`).
2. Copies the template to that name.
3. Fills placeholders and appends song scans.

The template file’s modified time should stay unchanged; only the output doc updates.

## Env vars

See `.env.local.example` for `GRG_TEMPLATE_TITLE`, `GRG_TEMPLATE_ID`, and `GRG_OUTPUT_TITLE`.

After changing Google scopes, use **Reconnect Google** in the app.

## Template validation (apply)

Before copying the template, the app checks:

| Placeholder / slot | If missing |
|--------------------|------------|
| `{{GRG_DATE}}`, `{{GRG_SONG_LIST}}` | Apply blocked until fixed, or use **Skip intro & apply scans only** when `{{GRG_SCANS_BEGIN}}` is still present |
| `{{GRG_SCANS_BEGIN}}` | Apply blocked when any song scan will be written |
| BAND / CHOIR roster line `[Name \| …]: [Position]` | Warning only (roster for that section may not write) |

See [`docs/GRG-FORMAT-SPEC.md`](./GRG-FORMAT-SPEC.md) for the post-MVP reference-document format system.
