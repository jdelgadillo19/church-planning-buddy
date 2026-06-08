# Party mode session — Slide Deck platform redesign (2026-06-07)

Archive of the BMAD party-mode roundtable: **hosted Slide Deck → org-scoped index → thin Mac rig client**, aligned with [`party-prompt-ref-2026-06-07-slide-deck-platform.md`](../input/party-prompt-ref-2026-06-07-slide-deck-platform.md).

**Participants:** John (PM), Winston (Architect), Sally (UX), Mary (Analyst)  
**Facilitator:** BMAD party-mode orchestrator

---

## User steering request

> Web-hosted slide deck builder for any church; org-scoped ProPresenter index; thin local client on presentation rig (no terminal); optional remote editor client; queue triggered on rig; deprecate npm agent as primary path.

---

## Round 1 — Agents

### John (Product Manager)

📋 **John:** We have a "power user tool masquerading as a general product" problem. The npm agent is elegant for developers; non-technical operators should never see a terminal. Phase 0 success = *can a volunteer coordinator set up a service without asking IT?*

**Phasing:** 4-week cadence with forcing functions, not a 12-week monolith.

| Window | Deliverable |
|--------|-------------|
| Weeks 1–2 | Phase 0: schema + hosted index + web preview from cache; pilot touches web on day 15 |
| Weeks 3–4 | Phase 1: rig client apply; pilot runs real Sunday |
| Weeks 5–8 | Phase 2: remote pull/push, multi-org hardening |

**Epic priority:** (1) web builder UX, (2) hosted index, (3) rig client apply, (4) remote sync.

**Scope gates:** No Planning Center schema expansion beyond existing plan bundle in Phase 1; validate single-church schema with real data before multi-org UI.

**Pilot metrics:** 3 consecutive Sundays with web + rig only; zero terminal for operators; setup &lt; 20 min; second church onboarded before Phase 2 closes.

---

### Winston (System Architect)

🏗️ **Winston:** Cloud holds intent; rig holds state. Rig is **authority**, not a blind worker — validate builds against local index before apply; reject stale/conflicting builds.

**Index sync:** FSEvents on PP directories, 30s debounce → push `pp_index_snapshots` to Supabase. Web reads **latest committed snapshot**, not live rig. Show "last synced at."

**Blob staging:** Net-new media → Drive `/grapevine/{org_id}/staging/{build_id}/`; builds reference Drive IDs, never Mac paths.

**Tables:** `pp_rigs`, `pp_index_snapshots`, `slide_deck_builds` (org + rig scoped). Deprecate user-only `slide_deck_jobs`.

**Security:** Per-rig keypair from day one — no shared `SLIDE_DECK_AGENT_TOKEN` in production. Rig registers public key; signs snapshot pushes and apply acks.

**Form factor:** Native Swift menu bar + popover for lean FSEvents integration. Disagrees with heavy Electron on rig.

---

### Sally (UX Designer)

🎨 **Sally:** Menu bar daemons are invisible — non-tech operators forget they exist. **Small persistent window** (~clock widget size) on secondary monitor: always visible = trust.

**Rig window:** Status badge (Up to date / Build ready / Applying…); one full-width **"Apply Slide Deck"** button; collapsible "What changed?" one-liner from remote editor.

**ProPresenter startup:** Native modal — *"A new slide deck is ready. Apply now?"* — **Apply** (default) / **Skip for now**.

**Web:** Replace Options A/B/C with single **"Send to presentation rig"** + step progress (*Queuing… Ready on rig*). Yellow banner if rig in use: *build applies at next startup*.

**Loading:** Every async action gets verb phrase spinner ≤3s, then auto-dismiss success.

---

### Mary (Business Analyst)

📊 **Mary:** Role is always **per org** — never global. Org switcher like Planning Center; every write stamped with `org_id` at creation, not inferred from session.

**Permissions:**

| Action | Who |
|--------|-----|
| Queue build | `planner` or `admin` in org |
| Apply on rig | `operator` or `admin` in org **and** build `org_id` = rig `org_id` |

**RLS:** Filter all index/build queries by `org_id` at database level.

**Edge cases:** Same service date across orgs → show church label on every row; shared Google login → additive `org_members` on invite; removed member → invalidate org-scoped sessions, org owns queued content.

---

## Round 2 — Synthesis & decisions

### Decision 1: Client form factor (resolved)

| Voice | Position |
|-------|----------|
| Winston | Swift menu bar + popover |
| John | Electron `.dmg` (ship fast) |
| Sally | Small persistent window (visibility) |

**Party decision:** **Hybrid — "Grapevine Rig" small window app** that can **minimize to menu bar** after first-run setup.

- **Phase 1 ship vehicle:** **Tauri 2** (Rust shell + embedded web UI for status panel) — reuses TypeScript apply logic, smaller than Electron, signed `.dmg`.
- **Phase 1+ path:** Evaluate Swift native shell if Tauri FSEvents integration is insufficient.
- Rationale: Sally's visibility requirement wins for v1; Winston's lean/native preference deferred to v2 if needed.

### Decision 2: Security model

- **Per-rig Ed25519 keypair** generated on first launch.
- Registration: one-time pairing code from web (org admin) → rig stores private key in Keychain.
- API: `Authorization: Rig {rig_id}:{signature}` on snapshot upload, job claim, apply ack.
- **`SLIDE_DECK_AGENT_TOKEN`:** debug/CI only; documented deprecated for production.

### Decision 3: Sequencing

1. Phase 0 before rig apply (index + web preview from cache).
2. Bundle scanner read-only on rig → upload snapshots.
3. Rig client v0 = index upload only; v1 = apply + publish.
4. Remote pull/push = Phase 2 (change sets from PROPRESENTER-SYNC).

### Decision 4: Deprecation

- `SlideDeckHostedPanel` Options A/B demoted to collapsed "Advanced / troubleshooting."
- Primary CTA: **Send to presentation rig**.
- `npm run slide-deck:agent` → `docs/SLIDE-DECK-DEPRECATION.md` debug section only.

### Decision 5: Multi-org

- Phase 0 schema includes `org_id` on all new tables.
- Org switcher UI in Phase 1 web pass (after single-church pilot validates loop).
- New role `operator` in `org_members` for rig apply permission.

---

## Artifacts produced from this session

| Document | Purpose |
|----------|---------|
| [SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md](../planning/SLIDE-DECK-PLATFORM-PRD-ADDENDUM.md) | MVP + Sync alignment |
| [SLIDE-DECK-PLATFORM-EPICS.md](../planning/SLIDE-DECK-PLATFORM-EPICS.md) | Epics + security |
| [SLIDE-DECK-PHASE-0-SPEC.md](../planning/SLIDE-DECK-PHASE-0-SPEC.md) | Foundation spec |
| [SLIDE-DECK-PHASE-1-SPEC.md](../planning/SLIDE-DECK-PHASE-1-SPEC.md) | Rig client spec |
| [SLIDE-DECK-DEPRECATION.md](../SLIDE-DECK-DEPRECATION.md) | Interim path deprecation |

---

## Gating question (John)

After the pilot's third Sunday, what does the presentation operator say they *didn't* have to do — in under ten words?

Target answer: *"I didn't open Terminal or rebuild the playlist."*
