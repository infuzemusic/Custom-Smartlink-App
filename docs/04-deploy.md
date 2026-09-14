# Deploying

Two supported shapes. Pick one; nothing else in the app changes.

| | Vercel | Container (Fly, Railway, Render, Cloud Run) |
|---|---|---|
| Setup | Import the repo, set env vars | `Dockerfile` in the repo root |
| Custom domains | Added per domain in the dashboard, certs automatic | Depends on the host; most issue certs for added hostnames |
| Migrations | Run locally against the same `DATABASE_URL`, or as a build step | Release command on the same image |
| Cost at this size | Free tier is ample | Smallest instance is ample |

Either way you need a Postgres. Neon or Supabase free tier covers this comfortably —
the only bulky rows are the stored artwork, at roughly 100 KB per release.

## 1. Database

```bash
DATABASE_URL='postgres://…' npm run db:migrate   # idempotent, safe to re-run
DATABASE_URL='postgres://…' npm run db:seed      # only if you want the demo projects
```

`db/schema.sql` is written to be re-runnable: `create table if not exists` plus
`alter table … add column if not exists`, so the same command applies later changes.

On a container host, run migrations as a **release step on the same image**:

```
node --experimental-strip-types db/migrate.ts
```

The Dockerfile copies `db/` and the Postgres driver into the runtime image for exactly
this. The driver copy is not redundant: Next's standalone bundle inlines pure-JS
dependencies into its server chunks rather than leaving them in `node_modules`, so a
script running outside the bundle cannot resolve them.

## 2. Environment

Required:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `ADMIN_HOST` | Host the admin answers on. **Must not be a project domain.** Unset in production means no admin at all, which is the safe failure. |
| `ADMIN_PASSWORD_HASH` | From `npm run admin:hash -- yourpassword` |
| `SESSION_SECRET` | Any long random string; changing it signs you out |

Per project:

| Variable | Notes |
|---|---|
| `META_CAPI_TOKEN_<SLUG>` | System user token from your Business Portfolio. The database stores only this variable's *name*. |
| `META_TEST_EVENT_CODE_<SLUG>` | Optional, for Events Manager's Test Events tab |

Optional: `META_API_VERSION` (defaults to a current Graph API version — bump it a couple
of times a year), `ODESLI_API_KEY` (raises the link-resolver rate limit).

Never set `ALLOW_LOCAL_FETCH` in production. It exists so the test suite can fetch
artwork from a stub on localhost, and it disables the guard against server-side requests
to private addresses.

## 3. Domains

For each project, in this order:

1. Point the hostname at the deployment — `CNAME link.artistname.com → <your host>`, or
   an ALIAS/ANAME at the apex, since a CNAME at the apex is not valid DNS.
2. Add the hostname to the platform so it issues a certificate.
3. Add it to the project in the admin, under Domains.
4. Verify the **root** domain in your Business Portfolio, and create that project's pixel
   and a system user token for the Conversions API.

Until step 3 the host is unknown to the app and returns 404. That is deliberate: a
fallback to some default project would fire one project's events into another's pixel.

## 4. Health check

`GET /healthz` returns `{"ok":true,"projects":n}`, or 503 if the database is unreachable.
It answers on any hostname, so platform health checkers hitting an internal address work
without being added as a project domain.

## 5. First-deploy checklist

- [ ] `/healthz` returns 200
- [ ] A release page loads on its own domain; an unknown host 404s
- [ ] Artwork serves from `/artwork/<id>` on your domain
- [ ] Sign in at `https://<ADMIN_HOST>/admin`; the tracking card does **not** say
      "missing in this environment" for any project
- [ ] With `META_TEST_EVENT_CODE_<SLUG>` set, load a page and click through to a DSP,
      then watch Events Manager → Test Events for a `PageView` and a `DspClick`
- [ ] Confirm each event appears **once**, not twice — that is the deduplication working
- [ ] Check Event Match Quality after a day of real traffic; aim for 8+

The last two are the only things that cannot be verified before going live.
