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

3. Remove broken date text (e.g. `AMay 24th, 2026`) — the app replaces `{{GRG_DATE}}` from PCO.
4. Keep roster / stage layout / team blocks **above** `{{GRG_SONG_LIST}}`.
5. Do not put placeholders inside tables or images.

## Output document

Each **Approve** run:

1. Trashes any existing doc named **`GRG_OUTPUT_TITLE`** (default: `Get Ready Guide (Good Friday)`).
2. Copies the template to that name.
3. Fills placeholders and appends song scans.

The template file’s modified time should stay unchanged; only the output doc updates.

## Env vars

See `.env.local.example` for `GRG_TEMPLATE_TITLE`, `GRG_TEMPLATE_ID`, and `GRG_OUTPUT_TITLE`.

After changing Google scopes, use **Reconnect Google** in the app.
