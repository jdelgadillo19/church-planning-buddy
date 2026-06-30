# Slide Deck Generator — operational walkthrough

Use this checklist after code deploy and Grapevine Client releases. All steps are GUI unless noted.

**Pre-flight (developer once):**

```bash
npm run operational:verify
npm run handoff:verify-migration
npm run env:cf          # after .env.local changes
npm run deploy:cf       # web
```

Tag and release **Grapevine Client v0.2.8+** for installer URLs on grapevineprep.com.

---

## Phase A — Admin foundation

1. Sign in to [grapevineprep.com](https://grapevineprep.com) as Owner → **Connect Google** (Drive).
2. **Slide deck → Presentation rigs (admin)** → pair Windows Envy with 8-character code.
3. On Envy: install [Grapevine Client](https://grapevineprep.com/downloads/grapevine-rig-windows-setup.exe) v0.2.8+.
4. In Grapevine Client → Advanced presentation rig setup: pair the rig, set **TCP/IP Port ID**, **ProPresenter library folder** (`Documents\ProPresenter`), **Save**, then **Scan now**.
5. On web: pick a PCO weekend → **Create Presentation** — songs should resolve (not all missing).

**Gate:** Pull filebase returns zip after M2 seed (`npm run filebase:verify-drive`); cloud index has library items.

---

## Phase B — Volunteer prep (Grapevine Client)

1. Install [Grapevine Client](https://grapevineprep.com/downloads/grapevine-rig-macos.dmg) on prep laptop (Node.js 20+ required).
2. Open Grapevine Client in **Remote prep workstation** mode.
3. On **grapevineprep.com/slide-deck**: pick weekend → **Create Presentation** → fix library → optional **Pull filebase**.
4. In **Grapevine Client**: continue the same weekend → build the playlist in local ProPresenter.
5. Edit in ProPresenter.
6. In Grapevine Client: **Export & Upload finished playlist** (or upload incomplete). Check **Replace on rig** if replacing.

**Gate:** Weekend presentations shows new upload with version label.

---

## Phase C — Admin sign-off

1. On grapevineprep.com: select complete handoff → **Admin sign-off — deliver to presentation rig** (or **Approve for presentation rig** if awaiting).

**Gate:** Handoff shows approved; admin can see **Received by presentation rig** after rig imports.

---

## Phase D — Rig operator (Envy)

1. Grapevine Rig shows pending handoff (picker if multiple).
2. **Import handoff** → staged `.proplaylist` path in status message.
3. ProPresenter: **File → Import → Playlist** → select staged file.
4. Optional: **Send to presentation rig** path from web for build-fresh services.

**Gate:** Sunday service runs from imported playlist; no ambiguous version pile for operator.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Scan now fails on Windows | Rig v0.2.8+; Node on PATH; library folder set |
| Create Presentation all missing | Rig Scan now; wait 1 min; refresh web |
| Grapevine Client won't open | Node 20+; reinstall client |
| No services_drive_url on incomplete | Upload with Grapevine Client (exports .proplaylist for incomplete too) |
| Librarian pull error | Owner Connect Google; `npm run operational:verify` |
