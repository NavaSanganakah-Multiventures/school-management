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
| Copy guard | migration ledger, per table, not a user count |
| Token signing key | one per school, fail-closed in the deploy |
| Billing authority | platform only, over a signed M2M channel |
| Orphan tenants | none; `admin` and `school813529` removed |

Seven dedicated schools, all `mode: "dedicated"`: `vidyasetu`, `a`,
`yagya-pragnya`, `school795082`, `school188328`, `qa-school-266668`,
`yagyaashram`.

## Phase 3 — Deploy data safety · **MOSTLY DONE**

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
3. `dedicatedHasData` — **done, replaced**. It decided whether to skip the
   shared→dedicated copy by counting `system_users` rows, which meant a school with
   data but no user accounts was re-copied on every deploy — and because the copy is
   `INSERT OR REPLACE` from a shared D1 that is stale by construction, that silently
   overwrote the dedicated copy with older rows. Replaced by the ledger in (4).
4. Migration ledger — **done**, migration `0042`, `dedicated_migration_ledger`. One
   row per copied table with a source count and `completed_at`, so "did this school
   migrate correctly?" is answerable instead of inferred from a user count. Skips
   **per table**, not per school, so a school that is complete for 40 of 50 tables
   copies the remaining 10 rather than all 50. Deployed to all seven dedicated D1s.
5. Per-school `AUTH_SECRET` — **done**. Every dedicated worker used to sign with the
   platform's key, so one leak was a fleet-wide leak. Each school now has its own
   48-byte key in `DEDICATED_SECRETS_JSON`, and `deploy-dedicated.mjs` is
   **fail-closed** on two counts: no per-school key, and no `INTERNAL_SYNC_SECRET`.
   Both guards were tested directly — each exits 1 with its own message, and with
   both present neither fires.
6. R2/KV copy strategy for a school that moves — **next**. Both are left behind with
   no ledger entry, so media and config are silently not migrated.
7. Provisioning states `resources_ready → migrating → deployed → live` — **next**.
   Today `pending` and `live` are the only values, and the admin console's live check
   is what bridges the gap.

### 5a. The coupling that nearly made (5) an outage

`getInternalSyncSecret` derives `m2m_<hmac(AUTH_SECRET)>` when
`INTERNAL_SYNC_SECRET` is unset, and it was unset on **both** tiers. The derived
values matched only because the tiers shared one key.

Handing each school its own key would therefore have given every school an M2M
secret the platform cannot verify, and the billing proxy would have failed on all
seven schools at once. A fleet-wide `INTERNAL_SYNC_SECRET` is now set explicitly on
all eight workers. The deploy pipeline already referenced
`secrets.INTERNAL_SYNC_SECRET` in three places — the secret had simply never been
created, so nothing had ever exercised that code path.

Worth remembering: the two secrets are coupled in code and independent in intent.
Anything that changes one must check the other.

## Billing is now platform-only · **DONE, but read this**

A dedicated worker does not answer billing, plugins or features. Those are proxied
to the platform, which holds the only authoritative subscription records.

The proxy used to forward the school's own user token, which stopped working the
moment the two tiers were made mutually exclusive — a school role is valid only on
its dedicated worker, so the platform refused it and every authenticated billing call
on a dedicated school answered 401. That regression was mine (#114), it shipped, and
it went unnoticed because **every probe run until then was unauthenticated**, where
a 401 is the correct answer and therefore indistinguishable from a broken one.

How it works now:

| | |
|---|---|
| Dedicated → platform | signed M2M request; **no user credential is forwarded** |
| School identity | `SCHOOL_ID` from the worker's own env, not from the caller |
| School id placement | inside the **signed path**, `/api/internal/<schoolId>/api/billing/…` |
| Acting role | forwarded only from a token the worker verified itself |
| Plan decision | the platform's own database, never the school's word |
| Re-entry | in process via a registered dispatcher, never `fetch()` to its own hostname |

The school id is in the path because `INTERNAL_SYNC_SECRET` is fleet-wide, so it
proves *a* dedicated worker asked, not *this* one. A header-carried school id could
be swapped by any worker and the signature would still verify.

An M2M signature is **re-verified** in `api/billing`, not merely presence-checked.
Accepting a request that merely carried a non-empty `X-Internal-Secret` would have
let a public caller set both headers and read any school's subscription.

### A note on the trial/enterprise shortcut

`api/billing/index.ts` still contains:

```ts
const planId = isDedicated ? 'enterprise' : (/* real subscription */);
```

and grants every module, unlimited students/staff/email and all feature flags on that
basis. It is now **dead for dedicated schools**, because the platform answers their
billing and on the platform tier `isDedicated` is false. Verified: the `yagyaashram`
trial reports `planId: "trial"` with 8 modules, not `"enterprise"` with 17.

The line is untouched and would come back to life the moment a dedicated worker
answered billing itself. It is listed under *Needs a person* because deleting it is
a one-line change with a customer-visible effect, and that is a decision, not a
refactor.

## Verification habits that earned their place

Three separate incidents in this work were the same mistake: a green check that was
not looking at the thing it claimed to check.

- `verify-phase0-signing.mjs` passed against a *hand-written copy* of a function
  rather than the real one.
- A check matched its own explanatory comment instead of the code.
- An extractor regex used `.*$`, which matches nothing on CRLF because JS `.` does
  not match `\r`.
- The billing proxy 401 above, caught only by a probe that actually logged in.

What is in place because of that:

- **`scripts/verify-billing-m2m.mjs`** (49 checks, in CI) transpiles the real `api/`
  tree and exercises the real modules. A source-scan cannot answer the only question
  that matters on an authorisation boundary: does a forged request actually get
  refused? Part D runs the whole chain in one process and asserts **exactly one
  network hop**, because a status check reads a 522 as a perfectly ordinary answer.
  It also asserts the deploy stays fail-closed, which no request could ever reveal: a
  shared signing key still signs and verifies correctly, it just verifies in too many
  places.
- **`scripts/mutation-check-billing-m2m.mjs`** (in CI) breaks the billing code nine
  ways on purpose and fails unless the harness notices. Writing it found three bugs in
  the harness, all of the same kind:
  - an inverted pass/fail test that reported `45 passed, 0 failed` as a success;
  - a body-tamper case that asserted a 401 without asserting the reason — equally
    satisfied by code refusing *every* signed POST. A control case now requires the
    unchanged request to reach route validation (400), which is what proves the
    signature verified rather than merely that something was refused;
  - a check that located a secret with a 400-character look-ahead and reported it
    missing because a six-line comment sat between the two keys. The code was right
    and the check was wrong. It is now written structurally, by splitting the
    workflow on `- name:`, so comment length cannot affect it.
  - and a check that named the old variable, so renaming it to a validated local
    silently disarmed it. It now rejects any `||` on the `AUTH_SECRET` line, whatever
    the left-hand side is called. This one was found only because a mutation failed to
    apply — the checker reporting `NOT APPLIED` is what made it visible.

One mutation is documented as surviving on purpose: dropping the comparison against
the configured internal secret. The signature is the real gate, since it is computed
with the presented secret, so that comparison is defence in depth rather than the
check itself.

The general rules this project keeps re-learning:

- **A 401 proves something was refused, not that the right thing was refused.** Where
  a refusal is the expected answer, the control case matters more than the negative
  one.
- **A green check must be shown to be able to go red.** A mutation runner is the only
  way to know, and it should be part of any harness guarding a security boundary.
- **A check that greps for a variable name breaks when the variable is renamed.** Grep
  for structure, not for spelling.
- **Probes that expect a refusal cannot find a regression that also refuses.** That is
  how a 401-on-every-authenticated-billing-call shipped unnoticed, and it is the whole
  argument for one standing authenticated check.

## Phase 4 — Test foundation

`vitest` + `@cloudflare/vitest-pool-workers`; RBAC matrix, tenancy isolation, fee
idempotency, webhook ordering; migration fresh+upgrade tests; provisioning tests
with mocked Cloudflare APIs; `flutter analyze` and `flutter test` as release gates;
build once, deploy the exact artifact.

The harnesses that exist today are static or local-D1 and are genuinely useful, but
they are throwaway by design. `scripts/verify-billing-m2m.mjs` is the shape worth
generalising: real modules, real crypto, in-process.

## Phase 5 — Flutter fixes

Cancel-button result handling; Razorpay checkout + `/verify` + idempotency; FCM
lifecycle on logout; `--dart-define=API_BASE_URL` with release-mode validation;
`allowBackup=false` + `dataExtractionRules` + `FLAG_SECURE`; centralised HTTP
timeouts; tenant-keyed PDF cache; request-epoch guards on attendance and report
cards; server-side session revocation.

The API-base fix that just landed (`AppConfig.getActiveBaseUrl` preferring its own
origin) is the first item in this list in practice, done early because it blocked
every Director login.

Rotating a school's `AUTH_SECRET` invalidates every existing session for that school,
so all users are logged out once. Passwords are unaffected: `hashPassword` is PBKDF2
keyed on the password with a random salt, never on the secret. If a rotation ever
needs to be invisible, that means server-side session storage, which is Phase 7.

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
| Preview URL | Dashboard: Workers → school-management → Settings → Domains → "Worker URL" → **Preview ON**. Until then every branch's preview check fails at "Deploy preview and resolve its URL" and PRs have to be merged with `--admin`. |
| `FORCE_SCHOOL_DATA_COPY=true` for existing schools | Production data operation. The copy list is fixed; schools that already hold data are skipped by the ledger and need this to pick up the 10 tables added later. |
| `isDedicated ? 'enterprise'` shortcut | Dead for dedicated schools today, and the platform is the only billing authority. Deleting it is a one-liner, but it is customer-visible if anything ever changes about how a plan is resolved. |
| Android upload keystores | In the working tree. Rotating them is a Play Console step. |
| `npm audit` — 1 moderate + 1 high | `next` and `postcss`, both pre-existing. `npm audit fix --force` takes a breaking Next major. |
| Deploy retry | `wrangler deploy` failed once with `fetch failed` (transient network) and passed on re-run. A retry wrapper is worth adding. |
| Stale `da.pragnya.nasven.com` | Nothing to clean. The zone has a wildcard DNS record, so any subdomain with no worker behind it returns 522 — a randomly invented subdomain returns the identical 522, which is what proves it. |
| Verified authenticated portal, standing | Improved: the billing chain is now exercised end to end against the real modules, and the live Director login works. Still no *standing* authenticated check against a running preview, because a preview has no platform tier to authenticate against. |

## Closed since the last update

| Item | Resolution |
|---|---|
| Test tenant `school813529` | My mistake, created against the live register endpoint. Worker, D1, R2 and KV deleted by hand — the deprovision endpoint returns 410 by design. |
| "da" school, slug `admin` | It squatted on `admin.pragnya.nasven.com`, which is the **Super Admin console's own route** (worker `school-management-admin`). That is why `admin` was reserved in the first place. Verified dead before removal: 0 students, 0 teachers, 0 attendance, 1 user. Resources deleted; the console was a different worker and was untouched. |
| `yagya-db` | Empty D1, zero tables, no worker and no KV sibling. Deleted. |
