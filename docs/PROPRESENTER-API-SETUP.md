# ProPresenter Local API — setup

**Target:** ProPresenter **21.3** on the operator Mac (same machine as `npm run dev`).

## 1. Enable API in ProPresenter

1. Open **ProPresenter** → **Settings** (macOS: **ProPresenter** → **Settings**).
2. Go to **Network**.
3. Enable the **API** and note the **Port ID** shown on that screen.
4. Put that number in `.env.local` as `PP_PORT` (yours may **not** be `50001` — that is fine).

**Two ports on some installs:** Settings → Network may show:

| UI label | Example | Typical use |
|----------|---------|-------------|
| **Port** (with IP address) | `64496` | Network / Remote / sometimes HTTP |
| **TCP/IP Port ID** | `64509` | TCP JSON API (line-delimited `{"url":"v1/..."}`) |

Run `npm run pp:diagnose`. If **TCP ✓** on `64509` but **HTTP ✗** with `HPE_INVALID` or “not HTTP/1.1”, that port is **TCP-only**. Set:

```bash
PP_PORT=64509          # TCP/IP Port ID from diagnose
PP_TRANSPORT=tcp       # required for TCP-only port
# PP_NETWORK_PORT=64496   # optional — diagnose will also test Network-tab port
```

CPB uses the **TCP JSON** transport on `PP_PORT` when `PP_TRANSPORT=tcp` (same API as HTTP, different wire format per [Renewed Vision TCP/IP docs](https://support.renewedvision.com/hc/en-us/articles/31606866768147)).

5. Optional: **API Documentation** button in Network (same spec as [openapi.propresenter.com](https://openapi.propresenter.com/)).

**CLI note:** `npm run pp:status` loads `.env.local` automatically. If the error still shows port `50001`, the file was not read (wrong directory or missing `PP_PORT=` line).

## 2. Configure Church Planning Buddy

```bash
cp .env.local.example .env.local   # if needed
```

Set in `.env.local`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PP_HOST` | `127.0.0.1` | ProPresenter host |
| `PP_PORT` | `50001` | **Port ID** from Network settings (your value may differ) |
| `PP_HTTPS` | `false` | Use `https` if enabled in PP |
| `PP_REQUEST_TIMEOUT_MS` | `10000` | Request timeout |
| `PP_ALLOW_WRITES` | `false` | **Keep false** until signed-off apply |

## 3. Verify connection

**CLI (recommended on operator Mac):**

```bash
npm run pp:status     # quick ping
npm run pp:diagnose   # HTTP + HTTPS + TCP tests + hints (use when status fails)
npm run pp:probe      # full read-only Phase 0 probe
```

**If status fails with ProPresenter open:**

1. Confirm **Enable Network** is checked (not only viewing a port number).
2. With ProPresenter running: `lsof -nP -iTCP:64509 -sTCP:LISTEN` (use your `PP_PORT`). No output = nothing listening.
3. `curl -v http://127.0.0.1:64509/v1/libraries` — compare with `npm run pp:diagnose`.
4. Toggle **Enable Network** off, then on (workaround on some Mac versions).
5. If diagnose shows **TCP ✓** on `PP_PORT` but **HTTP ✗**, set `PP_TRANSPORT=tcp` (see two-port table above).
6. After changing `.env.local`, `npm run pp:status` should print `OK`.

**With a known presentation UUID** (for arrangement/cue shape in spike doc):

```bash
npm run pp:probe -- --uuid <presentation-uuid>
npm run pp:probe -- --uuid <presentation-uuid> --json > docs/samples/pp-probe-sample.json
```

**HTTP (with dev server running):**

```bash
curl -s http://localhost:3000/api/propresenter/status | jq .
curl -s -X POST http://localhost:3000/api/propresenter/probe \
  -H 'Content-Type: application/json' \
  -d '{"presentationUuid":"<uuid>"}' | jq .
```

## 4. Code layout

| Path | Role |
|------|------|
| `src/lib/propresenter/config.ts` | Env → connection settings |
| `src/lib/propresenter/client.ts` | HTTP client + errors |
| `src/lib/propresenter/safety.ts` | Write allowlist / blocked paths |
| `src/lib/propresenter/probe.ts` | Read-only Phase 0 probe |
| `src/app/api/propresenter/status/route.ts` | Connection check |
| `src/app/api/propresenter/probe/route.ts` | Probe report JSON |
| `scripts/propresenter-probe.ts` | Operator CLI |

## 5. Safety (MVP)

- **Default:** read-only (`PP_ALLOW_WRITES=false`).
- **Blocked:** `POST`/`PUT`/`DELETE` on `v1/libraries` and `v1/library/*` (filebase wipe risk). `GET` enumeration is allowed.
- **Future writes (after signoff):** allowlisted playlist create/update only — see `safety.ts`.
- **Never:** overwrite another week’s presentation; destructive library sync.

Record spike findings in [`PROPRESENTER-API-SPIKE.md`](./PROPRESENTER-API-SPIKE.md).
