# 07 — Workflow: Admin

**Actor:** `org_members.role = admin`

---

## Admin capabilities (inventory)

| Capability | Current UI | Target UI | API |
|------------|------------|-----------|-----|
| Pair presentation rig | slide-deck rig admin panel | `/settings/rigs`? | pairing-codes |
| Manage members | none | `/settings/members`? | TBD |
| Configure Drive folders | env / terminal | `/settings/drive`? | deferred plan |
| View audit / builds | web build status | | |

---

## Rig pairing flow (edit)

```mermaid
sequenceDiagram
  participant Admin as Admin browser
  participant Web as grapevineprep.com
  participant Rig as Grapevine Rig

  Admin->>Web: Generate pairing code
  Web-->>Admin: 8-char code
  Admin->>Rig: Share code verbally
  Rig->>Web: Exchange code for rig credentials
  Web-->>Rig: Paired
```

---

## Settings: Drive layout (deferred)

Link decisions to [org-drive-settings-ui.md](../org-drive-settings-ui.md):

- Paste folder links vs browse tree
- Validate on save
- Who can edit

---

## Your notes

_Auth structuring: invite flow, revoke, role changes._
