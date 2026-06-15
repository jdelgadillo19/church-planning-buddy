# 09 — States, errors, and empty patterns

Cross-cutting UX rules so tools feel consistent after overhaul.

---

## Loading states

| Pattern id | When | UI | Example surfaces |
|------------|------|-----|------------------|
| `loading.page` | Initial route load | Full-page spinner or skeleton | grg, slide-deck |
| `loading.action` | Button submitted | Disable button + label change ("Applying…") | rig Apply, GRG Approve |
| `loading.poll` | Background refresh | Subtle indicator every N seconds | build status 8s |

**Your standards:**

| Tool | Button loading copy | Poll interval |
|------|---------------------|---------------|
| GRG | | |
| Slide deck | | |
| Rig | Applying… / Scanning… | |

---

## Empty states

| Pattern id | When | Message tone | CTA |
|------------|------|--------------|-----|
| `empty.no_build` | Rig: no pending build | | Wait for planner |
| `empty.no_plan` | Tool: plan not loaded | | Select date |
| `empty.no_submissions` | Merge: single author | | |

---

## Error presentation

| Pattern id | When | UI location | Recover action |
|------------|------|-------------|----------------|
| `error.banner` | Recoverable top-level | Top of tool content | Dismiss + fix |
| `error.inline` | Field-level | Under input | |
| `error.card` | Blocking (rig conflict) | Dedicated card in context | Explicit buttons |
| `error.toast` | _use? yes/no_ | | |

**API error mapping (fill):**

| HTTP / error type | User-facing message strategy |
|-------------------|------------------------------|
| 401 not signed in | |
| 403 Drive / org | |
| 400 validation | Show server `error` text |
| PP timeout | |

---

## Success confirmation

| Pattern id | When | UI |
|------------|------|-----|
| `success.apply` | GRG / rig apply done | |
| `success.queued` | Send to rig | Build id + poll |
| `success.publish` | Drive package | Link to folder |

---

## Confirm dialogs

List where `window.confirm` should **stay** vs become **in-app modals**:

| Current | Location | Target |
|---------|----------|--------|
| Apply to PP confirm | slide-deck local | |
| Overwrite confirm | slide-deck local | replace with conflict card? |
| GRG approve | grg | |

---

## Index / freshness

| Surface | Stale threshold | Banner copy |
|---------|-----------------|-------------|
| Slide deck preview | 7 days | "Library index last updated …" |

---

## Accessibility / copy rules (optional)

- Button verbs: _Approve_ vs _Save_ vs _Apply_
- Destructive actions: _Overwrite_ requires explicit confirmation? Y/N
- Operator-facing copy: short, no terminal jargon

---

## Your notes
