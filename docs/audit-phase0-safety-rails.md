# Codebase Audit + Implementation Roadmap — Pragnya Mitra

> Branch: `fix/phase0-safety-rails` · Phase 0 implemented
> Full audit findings: 4 parallel deep audits (backend / React / infra+DB / Flutter),
> every CRITICAL claim independently re-verified against the source before acting.

---

## 0. Reality check (read this first)

Two assumptions in the repo docs are **wrong**, and they change the priority order:

| Assumption | Verified reality |
|---|---|
| "React CRM (`components/`) is the main UI" | **Dead code.** `app/page.tsx:1-13` renders only `LandingPage`. `SchoolCrmShell` (`components/school-crm-shell.tsx:140`) has **zero importers** anywhere in the repo. |
| "The real UI is the React shell" | **No — it's Flutter.** `flutter_apps/school_management_app` (12.7k lines) + `super_admin_app` (6.1k) + `shared` (788). |
| "Plugin rules protect the shell" | `.agents/rules/ai-instructions.md:111` protects a file that is never mounted. **Rules are stale.** |

**Consequence:** frontend-audit findings about bundle size, modals, portals etc. are
*latent*, not live. Real priority is **Backend RBAC + Flutter + deploy safety**.

---

## 1. Critical findings (all verified)

### 1.1 RBAC is essentially absent — the single biggest problem

`api/index.ts:33-110` installs **no auth middleware**. Each route does its own check, and
most only verify *"is there a token?"*.

The DB has 5 roles (`db_migrations/0034_parent_role_support.sql:17`):
`Director, Principal, Staff, Parents, Students`.
The TS type allows only 4 (`api/lib/auth.ts:4`): `SuperAdmin, Director, Principal, Staff` —
so `Parents`/`Students` are **invisible at the type level**, which is why the role checks
were written to only special-case `Staff`.

| Endpoint | What any authenticated user can do | Location |
|---|---|---|
| `POST /api/fees/pay` | Mark any invoice **Paid** without paying | `api/fees/index.ts:67-101` |
| `POST /api/students` | Parents/Students can **create** students | `api/students/index.ts:362-371` |
| `DELETE /api/students/:id` | Parents/Students can **delete** students | `api/students/index.ts:765-774` |
| `GET /api/students` | Full school **Aadhaar + bank data** leak | `api/students/index.ts:179-209` |
| `POST /api/exams` + marks | Create exams, **rewrite anyone's marks** | `api/exams/index.ts:53-77, 120-197` |
| `GET`/`DELETE /api/notices` | Publish/delete **school-wide notices** | `api/notices/index.ts:50-138` |
| `GET /api/staff` | **No null-check at all** — salaries public | `api/staff/index.ts:33-54` |
| `GET /api/students/:id/history` | **No null-check at all** — unauthenticated | `api/students/index.ts:446-514` |

**Impact:** one parent/student login = whole-school PII + financial fraud.
This is a DPDP-Act-grade exposure, not a bug.

### 1.2 Data-destroying deploy paths

| Issue | Location |
|---|---|
| Admin "deprovision" flips routing **without copying** dedicated D1/R2/KV | `api/admin/index.ts` (now disabled, see §2.1) |
| `downgrade-school.mjs` omits `--remote` (targets **local** D1), lists non-existent tables (`staff`/`fees` vs `teachers`/`fee_invoices`), still marks school "shared" | `scripts/downgrade-school.mjs` (now hard-blocked) |
| `dedicatedHasData` infers "copy complete" from **one table** (`system_users`) | `scripts/migrate-to-dedicated.mjs:115-128` |
| Migration `0038` tables are **missing** from the copy list | `scripts/migrate-to-dedicated.mjs:22-78` |

### 1.3 Money correctness

1. **Global `UNIQUE` constraints break the 2nd tenant** (verified)
   - `teachers.employee_code UNIQUE` (`0001:36`) — every school's first teacher is `EMP-010`
   - `fee_invoices.invoice_number UNIQUE` (`0001:60`) — every school's first invoice is `INV-2026/001`
   - `system_users.email UNIQUE` (`0002:28`)
2. **Webhook can permanently drop a captured payment** — `api/webhooks/index.ts:106-116`
   treats *any* insert error as "duplicate" and returns 200.
3. **Fee payment is non-atomic**, no idempotency key — `api/lib/fee-payment.ts:68-97`
4. **`/api/fees/create-bulk` always fails** — `api/fees/index.ts:167` selects
   `full_name` from `students`, but that column **does not exist**
   (`0001:13-32` defines `first_name`/`last_name`). Same bug in
   `api/lib/fee-notify.ts:18` → **fee receipt emails never send** (error swallowed).
5. **`api/ai/index.ts:234` queries `auth_users`** — that table does not exist.
6. **Production routes execute DDL** — `api/notifications/index.ts:508,561,633`,
   `api/fcm-proxy/index.ts:91,148`.

### 1.4 Flutter (the actual production UI)

| Bug | Impact |
|---|---|
| **Super Admin "Cancel" still executes the action** (`super_admin_app/lib/screens/school_actions.dart:240-897`) — `showDialog` result is never checked | Closing a dialog runs approval / payment-link / provisioning |
| **School billing creates a Razorpay order but never opens checkout** (`school_management_app/lib/services/billing_service.dart:12-27`) | Payment impossible; user shown fake "instructions" |
| FCM topics predictable + no unsubscribe on logout | Device keeps receiving the previous school's notifications |
| `allowBackup` default, no `FLAG_SECURE` | Aadhaar/bank data in backups and screenshots |
| No `--dart-define`; production URL hardcoded | A QA build can mutate production |
| Keystores + `key.properties` in the working tree | Signing-credential exposure (rotate) |
| No HTTP timeouts | Dead network = indefinite loading |
| `PdfService._cachedSchool` is a global static, not cleared on logout | Previous school's name on a new receipt |

### 1.5 Infra / CI

Zero tests · deploy ≠ tested artifact · floating action tags receiving production
secrets · `SEND_EMAIL` missing from dedicated/admin configs (school password reset
email cannot send) · dedicated workers share the platform `AUTH_SECRET` (one
compromise = whole fleet) · plaintext secrets in KV · no backup strategy ·
`.gitignore` missing `.env`/`.dev.vars`/`.wrangler`/`*.jks`.

### 1.6 Positive controls (do not touch)

- Session HMAC verified with `crypto.subtle.verify` — `api/lib/auth.ts:86-98`
- `AUTH_SECRET` weak/missing ⇒ **fail closed** in prod — `api/lib/auth.ts:55-75`
- Dedicated workers reject SuperAdmin + pin `SCHOOL_ID` — `api/lib/auth.ts:107-117`
- `X-School-Id` honoured only for SuperAdmin — `api/lib/auth.ts:130`
- Razorpay webhook verified on **raw body** with constant-time HMAC — `api/lib/razorpay.ts:276-287`
- No SQL injection found (parameterized throughout)
- Flutter stores JWT in `flutter_secure_storage`; no hardcoded credentials
- No `BEGIN`/`COMMIT` in migrations (repo rule respected)

---

## 2. Phase 0 — Safety Rails (IMPLEMENTED in this branch)

Goal: close the paths that can lose data or hand over control **before** touching
business logic, so later phases are safe to work on.

### 2.1 Deprovisioning disabled — `api/admin/index.ts`
`POST /api/admin/schools/provision/deprovision` now returns **410 Gone** with the reason
and the cutover checklist. The unsafe helper is no longer imported. The console button in
`components/screens/admin-console-screen.tsx` now explains the block instead of firing a
request that always 410s.

Re-enable only after: immutable backup → row-count/checksum reconciliation →
non-overwriting dedicated→shared upsert with ID collision mapping → explicit SuperAdmin
approval → old route kept warm until verified → shared purge last.

### 2.2 `downgrade-school.mjs` hard-blocked
Exits 1 with a full explanation. Escape hatch for recovery only:
`PRAGNYA_ALLOW_UNSAFE_DOWNGRADE=1 node scripts/downgrade-school.mjs <slug> --i-accept-data-loss-risk`

### 2.3 `/api/admin/bootstrap` gated — `api/admin/index.ts`
This endpoint overwrote the platform admin password from env **and deleted every other
`platform_admins` row**, while being fully unauthenticated — a free CPU-exhaustion vector
(each call forces PBKDF2) and a control-the-platform primitive.

Now requires `X-Bootstrap-Token` matching the new `PLATFORM_BOOTSTRAP_TOKEN` secret,
compared via `api/lib/constant-time.ts`. **Fails closed (503)** if the secret is unset, so
the endpoint can never silently fall back to open.

### 2.4 Internal M2M requests are now signed — `api/lib/internal-request-auth.ts`
`/api/internal/*` returns full user rows (incl. encrypted password hashes) for an
arbitrary caller-supplied `schoolId`, gated only by a **static, forever-replayable**
bearer token. Since every dedicated worker holds the same platform `AUTH_SECRET`, leaking
it is a fleet-wide credential oracle.

New scheme: HMAC-SHA256 over `version | method | path | timestamp | sha256(body)`,
5-minute replay window, constant-time verification. All first-party callers updated:
- `scripts/lib/internal-auth.mjs` (CI)
- `api/lib/tenant-sync.ts` (worker → worker)

**Staged rollout (do not skip):** the worker still accepts the legacy static token, because
in `deploy.yml` provisioning (`step 56`) runs *before* the worker deploy (`step 111`) —
requiring signatures immediately would break an in-flight deploy. Signature support
shipped in both halves at once, so all real traffic is already protected. To close the
legacy path permanently:
```bash
gh variable set INTERNAL_SYNC_REQUIRE_SIGNATURE --body true
```

### 2.5 Supply chain + CI hygiene
- All actions pinned to full commit SHAs (resolved live, not guessed); `persist-credentials: false`
- `npm install` → `npm ci`
- `.github/workflows/switch-to-npm.yml` **deleted** (it ran `npm install` then `git add -A` + push with a write-scoped token)
- Health/bootstrap loops now **fail the job** instead of finishing green while down; `curl` gets `--connect-timeout/--max-time`
- Removed the "dump every wrangler log into Actions output" step (those logs contain FCM device tokens, user/school ids, raw DB errors)
- Deploy now also forwards the previously-undelivered `RAZORPAY_WEBHOOK_SECRET` and `GEMINI_API_KEY`

### 2.6 `.gitignore` hardened
Added `.env*` (keeping `.env.example`), `.dev.vars*`, `.wrangler/`,
`wrangler-*.secrets.json`, `*.jks`/`*.keystore`/`key.properties`, `*.p12`/`*.pfx`/`*.pem`,
and service-account key patterns.

### 2.7 Verification
`scripts/verify-phase0-signing.mjs` (19 checks) cross-validates the **CI signer against
the worker verifier against an independent reference implementation** — a divergence in
those canonical strings would break production provisioning, so it is the point of the
script. Also asserts tamper/replay/method/path/secret binding and `constantTimeEqual`.

```
node scripts/verify-phase0-signing.mjs   # 19/19 PASS
npm run typecheck                        # clean
npm run lint                             # 0 errors (10 pre-existing warnings)
```

### 2.8 ⚠️ Operator action required before merge

`PLATFORM_BOOTSTRAP_TOKEN` is **not yet set in GitHub**. The bootstrap step now fails
loudly rather than silently skipping, so set it first:

```bash
openssl rand -hex 32
gh secret set PLATFORM_BOOTSTRAP_TOKEN
# optional, closes the legacy internal-token path:
gh variable set INTERNAL_SYNC_REQUIRE_SIGNATURE --body true
```

Also rotate both Android upload keystores (present in the working tree) — that is a manual
Play Console operation, not a code change.

---

## 3. Roadmap

| Phase | Duration | Closes |
|---|---|---|
| **0 — Safety Rails** | 2-3d | data loss, credential exposure ✅ **done** |
| **1 — RBAC Foundation** | 5-7d | PII breach + financial fraud |
| **2 — Money Correctness** | 3-4d | payment loss, wrong charges |
| **3 — Deploy Data Safety** | 3-4d | tenant data loss |
| **4 — Test Foundation** | 4-5d | makes everything after it safe |
| **5 — Flutter Fixes** | 5-7d | cancel-button corruption, payment flow |
| **6 — Dead Code & Rules** | 2-3d | maintenance debt |
| **7 — Hardening & Scale** | ongoing | perf, observability, backup |

### Phase 1 — RBAC Foundation (highest value)

1. `api/lib/roles.ts` — add `Teacher`, `Student`, `Parent`; fix the stale `PlatformRole` union
2. `api/lib/rbac.ts` — `requireAuth(...roles)`, `requireSchoolScope()`, `requirePlanFeature()`,
   `requireClassTeacher()`, `requireParentOwnChildren()`. Mount in `api/index.ts`, **default deny**
3. Apply per route in the priority order of §1.1
4. Migration `0039`: `parent_student_links` + composite unique index (no `BEGIN`/`COMMIT`)
5. Role-specific DTOs — strip `aadhaar_number`, `bank_account_no`, `salary`, `recipientToken`
   from list responses; expose on detail endpoints only for authorized roles
6. Tests: a route × role matrix asserting 200/403

### Phase 2 — Money Correctness
Fix `full_name` (2 sites) and `auth_users`; migration `0040` global `UNIQUE` → composite;
webhook idempotency on the real event id + only-unique-violation-is-duplicate +
state guards on `payment.failed`; atomic conditional fee UPDATE + `idempotency_key`;
subscription period fields; add `SEND_EMAIL` to dedicated/admin configs; remove runtime DDL.

### Phase 3 — Deploy Data Safety
Migration ledger (per-table source count + checksum + `completed_at`); fix
`dedicatedHasData`; add `0038` tables to the copy list; R2/KV copy strategy; **per-school
`AUTH_SECRET` mandatory, fail closed**; `schools.json` JSON Schema + `execFileSync`
(no shell interpolation); provisioning states `resources_ready → migrating → deployed → live`;
move legacy-dispatcher cleanup to a separate manual post-migration workflow.

### Phase 4 — Test Foundation
`vitest` + `@cloudflare/vitest-pool-workers`; RBAC matrix, tenancy isolation, fee
idempotency, webhook ordering; migration fresh+upgrade tests; provisioning tests with mocked
Cloudflare APIs; `flutter test` + `flutter analyze` as release gates; build-once-deploy-exact-artifact.

### Phase 5 — Flutter Fixes
Cancel-button result handling; Razorpay checkout + `/verify` + idempotency; FCM lifecycle
on logout; `--dart-define=API_BASE_URL` with release-mode validation; `allowBackup=false`
+ `dataExtractionRules` + `FLAG_SECURE`; centralized HTTP timeouts; tenant-keyed PDF cache;
request-epoch guards on attendance/report-card; server-side session revocation.

### Phase 6 — Dead Code & Rules
Decide whether the React CRM is revived or archived; realign plugin docs with Flutter;
delete duplicate login screens (one contains **hardcoded credentials**) and the duplicated
AI widget; regenerate/remove stale `schema.sql`; drop unused `firebase`/`motion` deps.

### Phase 7 — Hardening & Scale
Pagination on all list endpoints; Web Push SSRF host allowlist; AI output sanitisation
(replace `dangerouslySetInnerHTML`); atomic fail-closed email quota; observability with PII
redaction; D1/R2 backup + restore drill; backend plan/feature enforcement; WAF rate limits.
