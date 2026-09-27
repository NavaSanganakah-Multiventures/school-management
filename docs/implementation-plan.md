# Implementation plan

Phase 0, 1 and 2 of `audit-phase0-safety-rails.md` are done and verified in
production. This is the remaining work, ordered by what hurts most if left.

`docs/audit-phase0-safety-rails.md` §3 is the source of the phase list. This file
adds what the last few days of work turned up, and marks what is already closed.

## Where things stand

| Area | State |
|---|---|
| Phase 0 — safety rails | done, verified in production |
| Phase 1 — RBAC foundation | done, 153 checks |
| Phase 2 — money correctness | done, 34 checks |
| Shared worker | removed; tiers are mutually exclusive |
| Routing contract | apex-only, enforced in CI |
| Branch previews | wired; waiting on one dashboard switch |
| Family links (`parent_student_links`) | backfilled by migration 0041 |
| Dedicated D1 table coverage | audited in CI, 0 missing |

## Phase 3 — Deploy data safety · **IN PROGRESS**

The theme is: know what was copied, and refuse to guess.

1. `schools.json` shape validation — **done**. A schema-free registry means a
   malformed `slug` becomes a Worker name, a route and two filenames. Now asserted
   in CI: object shape, `slug`/`schoolId`/`domain`/`mode` present, slug is a strict
   DNS label, no duplicate slugs, no `schoolId` under two slugs, and every entry is
   `mode: "dedicated"` (any other value is a silent no-op now that shared mode is
   gone).
2. `deploy-dedicated.mjs` command injection — **done**. It ran
   `execSync('npx wrangler deploy -c wrangler-' + slug + '.toml')` with the slug
   interpolated into a shell command string. `slug` is registry data. Now
   `execFileSync` with an argument array, `shell: false`, and the secrets file is
   written `0600` and shredded after use.
3. `dedicatedHasData` — **next**. It decides whether to skip the shared→dedicated
   copy by counting `system_users` rows. Two problems: a school with data but no
   user accounts is re-copied on **every** deploy, and because the copy is
   `INSERT OR REPLACE` from the shared D1 — which is stale by construction — that
   silently overwrites the dedicated copy with older rows. Needs to consider every
   copied table, not one.
4. Migration ledger — per-table source count, checksum and `completed_at`, so
   "did this school migrate correctly?" is answerable instead of inferred from a
   user count. This is the durable fix for (3).
5. Per-school `AUTH_SECRET`, mandatory and fail-closed. Today every dedicated
   worker shares the platform's. `getAuthUser` pins a worker to its `SCHOOL_ID`, so
   a cross-school token is already refused, so this is defence in depth rather than
   a live hole — but a shared signing key means one leak is a fleet-wide leak.
6. R2/KV copy strategy for a school that moves. Both are currently left behind
   with no ledger entry, so media and config are silently not migrated.
7. Provisioning states `resources_ready → migrating → deployed → live`. Today
   `pending` and `live` are the only values, and the admin console's live check is
   what bridges the gap.

## Phase 4 — Test foundation

`vitest` + `@cloudflare/vitest-pool-workers`; RBAC matrix, tenancy isolation, fee
idempotency, webhook ordering; migration fresh+upgrade tests; provisioning tests
with mocked Cloudflare APIs; `flutter analyze` and `flutter test` as release gates;
build once, deploy the exact artifact.

The harnesses that exist today are static or local-D1 and are genuinely useful,
but they are throwaway by design — `verify-phase0-signing.mjs` once passed green
against a *copy* of the code it claimed to test, and that shipped a broken
`constantTimeEqual` to production. That is the argument for this phase.

## Phase 5 — Flutter fixes

Cancel-button result handling; Razorpay checkout + `/verify` + idempotency; FCM
lifecycle on logout; `--dart-define=API_BASE_URL` with release-mode validation;
`allowBackup=false` + `dataExtractionRules` + `FLAG_SECURE`; centralised HTTP
timeouts; tenant-keyed PDF cache; request-epoch guards on attendance and report
cards; server-side session revocation.

The API-base fix that just landed (`AppConfig.getActiveBaseUrl` preferring its own
origin) is the first item in this list in practice, done early because it blocked
every Director login.

## Phase 6 — Dead code & rules

Decide whether the React CRM is revived or archived. Delete the duplicate login
screens — **one contains hardcoded credentials** — and the duplicated AI widget.
Realign plugin docs with Flutter. Remove the stale `schema.sql`. Drop unused
`firebase`/`motion` deps.

## Phase 7 — Hardening & scale

Pagination on all list endpoints; Web Push SSRF host allowlist; AI output
sanitisation (replace `dangerouslySetInnerHTML`); atomic fail-closed email quota;
observability with PII redaction; D1/R2 backup and a restore drill; backend
plan/feature enforcement; WAF rate limits.

## Needs a person, not code

These are blocked on a decision or on access I do not have.

| Item | Why |
|---|---|
| `FORCE_SCHOOL_DATA_COPY=true` for existing schools | Production data operation. The copy list is fixed; schools that already hold data are skipped by `dedicatedHasData` and need this to pick up the 10 tables. |
| Preview URL | Dashboard: Workers → school-management → Settings → Domains → "Worker URL" → **Preview ON**. |
| "da" school slug `admin` | Reserved, so it can never be provisioned as dedicated. Changing a live tenant's public URL is a business decision. |
| Test tenant `school813529` | My mistake: created against the live register endpoint. Needs its D1 row plus the orphan Worker/D1/R2/KV removed. The deprovision endpoint returns 410 by design, so it is manual. |
| Android upload keystores | In the working tree. Rotating them is a Play Console step. |
| `npm audit` — 1 moderate + 1 high | `next` and `postcss`, both pre-existing. `npm audit fix --force` takes a breaking Next major. |
| Deploy retry | `wrangler deploy` failed once with `fetch failed` (transient network) and passed on re-run. A retry wrapper is worth adding. |
| Verified authenticated portal | Every probe so far has been unauthenticated. The first real Director session was today, and only because a user reported it. Worth a standing check. |
