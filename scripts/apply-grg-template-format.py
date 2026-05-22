#!/usr/bin/env python3
"""Add GRG template placeholders to a .docx (intro only + scan marker)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn

GRG_DATE = "{{GRG_DATE}}"
GRG_SONG_LIST = "{{GRG_SONG_LIST}}"
GRG_SCANS_BEGIN = "{{GRG_SCANS_BEGIN}}"

MONTH_DATE = re.compile(
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d",
    re.I,
)


def set_paragraph_text(paragraph, text: str) -> None:
    paragraph.text = text


def delete_paragraph(paragraph) -> None:
    element = paragraph._element
    element.getparent().remove(element)


def paragraph_has_page_break(paragraph) -> bool:
    for br in paragraph._element.xpath(".//w:br"):
        if br.get(qn("w:type")) == "page":
            return True
    return False


def find_indices(doc: Document) -> dict[str, int]:
    date_idx = None
    song_header_idx = None
    first_key_idx = None
    last_key_idx = None
    page_break_idx = None

    for i, p in enumerate(doc.paragraphs):
        t = p.text.strip()
        if date_idx is None and MONTH_DATE.search(t):
            date_idx = i
        if "song list" in t.lower():
            song_header_idx = i
        if t.lower().startswith("key of"):
            if first_key_idx is None:
                first_key_idx = i
            last_key_idx = i
        if page_break_idx is None and paragraph_has_page_break(p):
            page_break_idx = i

    if date_idx is None:
        raise ValueError("Could not find date paragraph (month name + day).")
    if first_key_idx is None or last_key_idx is None:
        raise ValueError('Could not find "Key of …" song list lines.')
    if page_break_idx is None:
        raise ValueError("Could not find page break after song list.")

    return {
        "date": date_idx,
        "song_header": song_header_idx,
        "first_key": first_key_idx,
        "last_key": last_key_idx,
        "page_break": page_break_idx,
    }


def apply_template_format(doc: Document) -> None:
    idx = find_indices(doc)

    set_paragraph_text(doc.paragraphs[idx["date"]], GRG_DATE)

    set_paragraph_text(doc.paragraphs[idx["first_key"]], GRG_SONG_LIST)
    for i in range(idx["last_key"], idx["first_key"], -1):
        if i != idx["first_key"]:
            delete_paragraph(doc.paragraphs[i])

    # Re-find page break after deletions
    page_break_idx = None
    for i, p in enumerate(doc.paragraphs):
        if paragraph_has_page_break(p):
            page_break_idx = i
            break
    if page_break_idx is None:
        raise ValueError("Page break missing after song list edit.")

    scans_marker_idx = page_break_idx + 1
    if scans_marker_idx < len(doc.paragraphs):
        set_paragraph_text(doc.paragraphs[scans_marker_idx], GRG_SCANS_BEGIN)
    else:
        doc.add_paragraph(GRG_SCANS_BEGIN)

    # Remove all content after marker (sample scans not needed in template)
    while len(doc.paragraphs) > scans_marker_idx + 1:
        delete_paragraph(doc.paragraphs[scans_marker_idx + 1])


def main() -> int:
    src = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else "/Users/jessedelgadillo/Downloads/Get Ready Guide (SUN).docx",
    )
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src

    doc = Document(str(src))
    apply_template_format(doc)
    doc.save(str(dst))
    print(f"Saved template-formatted doc: {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
