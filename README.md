# Pragnya Mitra School Management System & CRM

Multi-tenant school management platform built on Cloudflare Workers.
यह single repo, single codebase है — कोई school-specific fork या hardcoded condition नहीं।

## Architecture

**हर स्कूल अपने dedicated worker पर चलता है — free trial भी।** Shared data plane
नहीं है, और platform worker कभी school का data plane नहीं बनता।

| Worker | Host | क्या serve करता है |
|---|---|---|
| Platform / control plane | `pragnya.nasven.com` | public website (Next.js `out/`), billing, provisioning, `/api/admin` |
| School data plane | `<slug>.pragnya.nasven.com` | Director, Principal, Teacher, Staff, Parent, Student — उसी school का data |
| Super Admin console | `admin.pragnya.nasven.com` | Super Admin Flutter app + `/api/admin` |

### दोनों tiers आपस में exclusive हैं

एक session token **सिर्फ उसी tier पर valid** है जहाँ वह बनाया गया:

- dedicated worker → `SuperAdmin` token reject; school role कोई भी school, लेकिन
  सिर्फ `SCHOOL_ID` वाला
- platform worker → **किसी भी school role को मान्य नहीं**; सिर्फ `SuperAdmin`

`api/lib/auth.ts` (`getAuthUser`) में दोनों directions enforce होते हैं। यह
एकतरफा नहीं है: पहले सिर्फ `SuperAdmin`-reject था, जिससे किसी school का Director
अपना session token platform worker पर चला सकता था — और request **shared D1**
पर जाती थी, जो stale है क्योंकि `migrate-to-dedicated.mjs` data shared से बाहर
निकालता है, वापस नहीं लिखता।

### Invented tenant नहीं होता

`getRequestSchoolId` और `resolveTenant` कोई default school नहीं बनाते।
`school-01` जैसा कोई placeholder tenant पहले platform worker पर fallback था, जिससे
बिना school वाला caller को एक असली, valid tenant मिल जाता था। अब platform tier
ख़ुद को report करता है और `schoolId` खाली होता है — जो `WHERE school_id = ''` को
fail-closed बनाता है।

### Routing

हर worker का **explicit** `[[routes]`** है — कोई wildcard नहीं।
`pragnya.nasven.com/*` सिर्फ apex पर, `<slug>.pragnya.nasven.com/*` सिर्फ उस
school पर, `admin.pragnya.nasven.com/*` सिर्फ admin console पर।

Wildcard इसलिए हटाया गया क्योंकि platform worker के पास website के assets हैं:
wildcard होने पर कोई भी unclaimed school subdomain **marketing website** दिखाता
था। अब ऐसा subdomain Cloudflare का error देता है — सही जवाब।

`scripts/verify-routing.mjs` यह contract CI में assert करता है।

## Previews (branch testing)

Feature branch push → production worker का **Preview**; `main` push → production.

| Branch | Command | Result |
|---|---|---|
| `main` | `wrangler deploy` | production |
| कोई भी दूसरी branch | `wrangler preview` | उसी worker का branch preview |

`[previews]` block `wrangler.toml` में है, `wrangler.preview-migrations.toml` preview
D1 के liye hai, aur `scripts/resolve-preview-url.mjs` Preview URL resolve karta
hai. Preview ke koi zone route, cron trigger, KV namespace ya `SEND_EMAIL` binding
nahi hota — ye teenon cheezein shared worker me zaroori thi, yahan structurally
possible hi nahi hain।

## Tech stack

- Next.js 15 + React 19 (static export to out/, served via Workers Assets)
- Hono (API router, api/index.ts)
- Cloudflare D1 (SQLite), R2 (media), KV (CONFIG_KV), Email (SEND_EMAIL)
- Firebase Cloud Messaging (web push), Razorpay (fees), Google Gemini (AI plugins)

## Directory layout

- api/            Hono backend (auth, students, exams, fees, plugins, ai, admin, lms, ...)
- components/     React UI (school-crm-shell + screens + modals)
- plugins/        Pluggable feature modules (AI Assistant, LMS, AI Report Analyzer)
- db_migrations/  D1 migrations (idempotent, school_id-scoped)
- scripts/        provisioning + deploy helpers + verification harnesses
- schools.json    Tenant registry (source of truth for dedicated deploy)

## Verification harnesses

सभी `scripts/verify-*.mjs` plain node scripts hain, real (local) D1 ya source
par chalte hain:

| Script | Kya cover karta hai |
|---|---|
| `verify-phase0-signing.mjs` | internal M2M signing, constant-time compare |
| `verify-phase1-rbac.mjs` | deny-by-default RBAC, family scoping, **tier exclusivity** |
| `verify-phase2-money.mjs` | payment idempotency, ledger, subscription state |
| `verify-routing.mjs` | routing contract, preview bindings, wrangler version pin |
| `verify-migration-0041.mjs` | `parent_student_links` backfill, cross-tenant refusal |
| `audit-dedicated-tables.mjs` | हर school-scoped table dedicated D1 तक पहुँचती है या नहीं |
| `resolve-preview-url.test.mjs` | Preview URL resolution + liveness |
| `smoke-preview.mjs` | deployed worker ke endpoints, real HTTP |

## Local development

    npm install
    npm run dev

Checks: npm run lint | npm run typecheck | npm run build

## Secrets (env से, plaintext नहीं)

- AUTH_SECRET — HMAC session signing (>= 32 chars, required)
- PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD — first SuperAdmin bootstrap
- CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID — provisioning + deploy
- RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET — payments
- FCM_SERVICE_ACCOUNT_JSON / WEB_PUSH_VAPID_PRIVATE_KEY / FIREBASE_WEB_CONFIG_JSON — push
- GEMINI_API_KEY — optional platform AI fallback
- GITHUB_TOKEN — dedicated worker provisioning (worker secret; schools.json commit via GitHub Contents API)
- SEND_EMAIL — Cloudflare Email binding (see wrangler.toml)

## Multi-tenancy rules

- हर shared-D1 query school_id scoped।
- Common features core में; school-specific → plugin / feature flag।
- Large files → R2; static config → KV; secrets → env।

## Plugin architecture

components/school-crm-shell.tsx को edit न करें। नया plugin register करने के लिए:
1. db_migrations/ में plugins/school_plugins row (INSERT OR IGNORE)
2. api/ में backend routes
3. plugins/index.ts में PLUGINS_REGISTRY entry

## CI/CD

.github/workflows/deploy.yml:
- build job: lint + typecheck + next build (pull_request और push दोनों पर)
- deploy job (सिर्फ main + non-PR): provision → wildcard DNS → D1 migrations → platform worker → dedicated workers

.github/workflows/deploy-preview.yml:
- हर non-main branch पर, और PRs पर: harnesses → preview D1 migrations → `wrangler preview` → smoke test

## Dedicated worker provisioning

**हर plan पर, free trial सहित, provisioning default है** — कोई plan-based gating
नहीं। `api/lib/provisioning.ts` हमेशा `mode: 'dedicated'` लिखता है।

SuperAdmin कंसोल में स्कूल की row पर "प्रोविजन" बटन से POST /api/admin/schools/provision कॉल होता है:
- schools.json (Tenant registry) में school entry mode: "dedicated" + slug/domain जोड़ता है
- GITHUB_TOKEN (PAT) से main branch पर commit करता है → deploy.yml → provision-school.mjs → D1/R2/KV + dedicated deploy
- school_tenants में provisioning_status track होता है; POST /api/admin/schools/provision/check से live status जाँचा जाता है

`POST /api/auth/register` भी यही करता है, तो instant trial का portal भी dedicated
होता है — बस उसे उस deploy का इंतज़ार करना पड़ता है जो provisioning शुरू करता है।
तब तक login `PORTAL_READY_SOON` (403) देता है और registration response
`portalStatus: 'provisioning'` ke saath dead URL nahi deta।

GITHUB_TOKEN worker secret के लिए repo में PROVISIONING_GITHUB_TOKEN नाम का PAT secret चाहिए
(fine-grained PAT, Contents: Read and write, इसी repo पर)। Built-in GITHUB_TOKEN जॉब खत्म होते ही
expire हो जाता है, इसलिए long-lived PAT आवश्यक है।

## Data: shared → dedicated copy

`scripts/migrate-to-dedicated.mjs` school ke rows shared D1 se uske apne D1 me
copy karta hai, `OPERATIONAL_TABLES` list ke hisaab se, parents-before-children
order me.

Jo table koi migration banata hai par list me nahi hai, wo **kabhi copy nahi hoti
aur koi error nahi aata** — `copyTable` sirf list wali names pe call hota hai.
Isliye `scripts/audit-dedicated-tables.mjs` har `CREATE TABLE` ko list se diff
karta hai aur uncovered school-scoped table par fail hota hai. Phase 1 (0039) aur
Phase 2 (0040) ne tables add kiye the aur list update nahi hui thi, jis se
`parent_student_links`, `fee_payment_idempotency` aur `payment_ledger` kisi bhi
school ke dedicated D1 me nahi pahunch rahe the.

`dedicatedHasData()` `system_users` count dekh kar poora copy skip kar deta hai,
toh jis school ke paas data already hai use repair ke liye
`FORCE_SCHOOL_DATA_COPY=true` chahiye (deploy.yml ka `workflow_dispatch` input)।

## Notes

- Migrations idempotent (CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE) और composite (school_id, ...) indexes के साथ।

## ईमेल कोटा व बिज़नेस-डोमेन ईमेल (Phase 3)

### सारांश
- हर स्कूल के लिए प्लान-आधारित मासिक ईमेल कोटा लागू होता है (broadcast/notification ईमेल पर)।
- Transactional ईमेल (forgot-password / login-नोटिफ़िकेशन) कोटा से मुक्त रहते हैं ताकि पासवर्ड रीसेट कभी block न हो।
- हर स्कूल अपना भेजने वाला (sender) ईमेल पहचान (from name / from email / reply-to) रख सकता है (business-domain email)।

### डेटा मॉडल (Migration 0026)
- subscription_plans.email_quota_limit — प्लान का default मासिक कोटा (NULL = असीमित)।
  - trial = 50, starter = 500, pro = 2000, enterprise = NULL (असीमित)।
- school_subscriptions.email_quota_limit — admin override (NULL हो तो प्लान का default लागू)।
- school_subscriptions.email_quota_used — चालू माह में भेजे गए broadcast/notification ईमेल।
- school_subscriptions.email_quota_reset_at — उपयोग काउंटर का माह (YYYY-MM)।
- school_email_config — प्रति-स्कूल sender कॉन्फ़िगरेशन (from_name, from_email, reply_to, is_active)।

### प्रभावी कोटा (precedence)
1. अगर school_subscriptions.email_quota_limit set है → वही प्रभावी।
2. वरना प्लान का emailQuotaLimit लागू।
3. दोनों NULL/absent → असीमित।

### API
- GET /api/email/quota — लॉगिन किए स्कूल का वर्तमान कोटा/उपयोग (data-plane, school-scoped)।
- POST /api/email/test — परीक्षण ईमेल भेजता है (सिर्फ़ Director/Principal)।
- GET /api/admin/schools — अब हर स्कूल में emailQuotaLimit, emailQuotaUsed, emailQuotaResetAt, emailFromName, emailFromEmail, emailReplyTo, emailConfigActive भी आते हैं।
- POST /api/admin/schools/email-config — Super Admin के लिए: मासिक कोटा (खाली = असीमित) + sender config एक साथ सेव करता है और उपयोग काउंटर रीसेट करता है।

### भेजने का प्रवाह
- api/lib/email.ts का sendSchoolEmail():
  1. SEND_EMAIL binding जाँचता है।
  2. school कोटा reserve करता है (block होने पर नहीं भेजता)।
  3. दैनिक anti-abuse कोटा (checkAndReserveEmailQuota) जाँचता है।
  4. sender: school config सक्रिय हो तो वह, वरना platform default pragnya@navasanganakah.com।

### ज़रूरी शर्त (Cloudflare Email Routing)
- SEND_EMAIL binding Cloudflare Email Routing पर निर्भर है। zone pragnya.nasven.com पर Email Routing सक्षम और sender verified होना चाहिए (उदा. no-reply@pragnya.nasven.com), वरना SEND_EMAIL.send() विफल होगा।
- किसी स्कूल का business-domain sender (उदा. no-reply@school.in) तभी काम करेगा जब वह डोमेन Email Routing में verified हो (या उस sender को अधिकृत किया गया हो)।
