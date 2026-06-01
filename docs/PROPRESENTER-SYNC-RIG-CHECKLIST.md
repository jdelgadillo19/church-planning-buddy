# ProPresenter sync — operator rig validation checklist

**Purpose:** Close open research questions Q2, Q3, Q9–10 on the real presentation Mac.  
**Research doc:** [_bmad-output/planning-artifacts/research/technical-propresenter-sync-file-format-research-2026-06-01.md](../_bmad-output/planning-artifacts/research/technical-propresenter-sync-file-format-research-2026-06-01.md)

Record results in `docs/spikes/propresenter-bundle-rig-YYYY-MM-DD.md` when complete.

---

## Before you start

1. Note ProPresenter version: __________
2. Note Support Files path (ProPresenter → Preferences → Advanced): __________
3. Quit ProPresenter before file copies unless step says otherwise.

---

## Q9–Q10: Bundle size

```bash
export PP_ROOT="<!-- paste Support Files path -->"
du -sh "$PP_ROOT"/* 2>/dev/null | sort -hr | head -20
find "$PP_ROOT" -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.pro' \) 2>/dev/null | wc -l
```

| Metric | Result |
|--------|--------|
| Total bundle size | |
| Largest subfolder | |
| Count `.pro` files | |
| Count video files | |

---

## Q2: Single-song edit footprint

1. Run `pp:bundle-scan --save before-edit` (after SYNC-1.3 exists) **or** save manual file list of `Libraries/` mtimes.
2. In ProPresenter, edit **one** song (change one lyric line). Save.
3. Rescan / compare mtimes.

| Question | Answer |
|----------|--------|
| Which paths changed? | |
| Only one `.pro`? | yes / no |
| Playlist files changed? | yes / no |

---

## Q3: Single-file backup/restore

1. Quit ProPresenter.
2. Copy one `.pro` from `Libraries/` to Desktop backup.
3. Make a trivial edit in PP, save, quit.
4. Restore backup over the `.pro` path.
5. Launch ProPresenter — presentation intact?

| Result | pass / fail |
|--------|-------------|
| Notes | |

---

## Q1: Protobuf decode (optional)

If [ProPresenter7-Proto](https://github.com/greyshirtguy/ProPresenter7-Proto) installed:

```bash
protoc --decode rv.data.Presentation ./propresenter.proto < /path/to/sample.pro | head -80
```

| Result | arrangements visible? yes / no |

---

## Sign-off

- [ ] Checklist completed by: __________ on date: __________
- [ ] Spike note filed under `docs/spikes/`
