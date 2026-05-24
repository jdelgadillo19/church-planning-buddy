# GRG scan section format

Reference: [`downloads/Get Ready Guide (SUN).docx`](../downloads/Get%20Ready%20Guide%20(SUN).docx) and [`PRODUCT.md`](../PRODUCT.md) §1.7.

## Regions per song scan

| Region | Layout | Content |
|--------|--------|---------|
| **Header** | Single column | Bold song title through horizontal rule; metadata (By, ©, CCLI, bar counts) |
| **Lyrics** | Two columns | Verse/chorus labels, lyrics body, interlude markers |

## Import heuristics (`src/lib/docs/scan-import.ts`)

1. **Header / lyrics split** — lyrics begin at the first of:
   - A horizontal rule line (`――――` or similar)
   - A line starting with `VERSE`, `CHORUS`, `BRIDGE`, `PRE-CHORUS`, `INTRO`, `TAG`, `OUTRO`, or `CODA`
   - After a CCLI line, the next bar-count or verse line
2. **Fallback** — if no marker found, first ~4 paragraphs treated as header.
3. **Import modes** (per song, in order):
   - `styled` — Docs API insert with bold/color/highlight from source Google Doc
   - `structure` — same layout, plain text in two-column section
   - `plain` — legacy `exportDocPlainText` + single-column append (warning shown)

## Golden plans

| Plan ID | Use |
|---------|-----|
| `87788328` | Intro + roster + song list vs SUN docx |
| `87788327` | Scan edge cases (Peace Be Still, Shout To The Lord, Holy Forever) |

## Manual format notes (fill in as needed)

- Header ends at: first full-width rule after CCLI block
- Two-column boundary: continuous section after header; `columnProperties.columns = 2`
- Preserve: bold, foreground color, background highlight from org scans
- Normalize: font family/size to match GRG template when possible (post-MVP)
