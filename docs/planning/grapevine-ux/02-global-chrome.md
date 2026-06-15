# 02 — Global chrome

Shared UI across web tools: header, auth, Google, org context, settings entry.

---

## Web shell (target)

Describe what appears on **every authenticated tool page** vs hub-only.

| Element | Hub `/` | Tool pages | Settings | Notes |
|---------|---------|------------|----------|-------|
| Logo + product name | | | | |
| Back to hub | | | | |
| Org name / switcher | | | | |
| User menu (sign out) | | | | |
| Google connection status | | | | |
| Role badge (admin/planner) | | | | |
| Settings link | | | | |

**Wire description (replace with your layout):**

```text
┌─────────────────────────────────────────────────────────┐
│ [icon] Grapevine Prep          Org: ________  [user ▾] │
│ Google: Connected ✓                    [Settings]      │
├─────────────────────────────────────────────────────────┤
│ ← Hub    Tool name                                      │
│ ... tool content ...                                    │
└─────────────────────────────────────────────────────────┘
```

---

## Auth gates

| State | User sees | Redirect |
|-------|-----------|----------|
| Not signed in | | `/login` |
| Signed in, no org | | |
| Signed in, no Google Drive scope | | Connect Google card |
| Wrong role for page | | 403 / message |

---

## Google connection UX

| Action | Where shown | Result |
|--------|-------------|--------|
| Sign in with Google | `/login` | Supabase session + Drive scopes |
| Reconnect Google | Hub card + tool pages? | Refresh `oauth_tokens` |
| Disconnect | | |

Reference: `GoogleConnectionCard`, `grg-drive-diagnose`.

---

## Settings shell (new — specify)

| Item | Route | Admin only? |
|------|-------|-------------|
| Members | /settings/members | |
| Drive layout | /settings/drive | |
| Presentation rigs | /settings/rigs | |
| _add_ | | |

**Subnav pattern:** tabs | left sidebar | hub cards

---

## Grapevine Rig chrome (desktop)

| Screen | Header | Primary actions |
|--------|--------|-----------------|
| Pairing | | Pair |
| Main (paired) | Rig name, status badge | Apply, Scan, Unpair |
| Build card | | |
| ProPresenter settings (details) | | |

---

## Open chrome decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Single `AppLayout` component for all tools? | |
| 2 | Mobile / narrow layout rules? | |
| 3 | Dark mode: keep current zinc theme? | |
