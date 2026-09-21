# Pragnya Mitra School Management System & CRM

Multi-tenant school management platform built on Cloudflare Workers.
यह single repo, single codebase है — कोई school-specific fork या hardcoded condition नहीं।

## Architecture

- Shared / control-plane worker: pragnya.nasven.com
  - SuperAdmin console, billing, plugin marketplace, school provisioning
  - Also serves non-dedicated school subdomains via the `*.pragnya.nasven.com` wildcard route
- Dedicated / data-plane workers: <slug>.pragnya.nasven.com
  - Director, Principal, Teacher, Staff, Student (school-scoped data)
  - Each dedicated worker is a plain Cloudflare Worker with its own per-school route
- Routing: direct per-school `[[routes]]` — every worker serves its own subdomain

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
- scripts/        provisioning + deploy helpers
- schools.json    Tenant registry (source of truth for dedicated deploy)

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
- deploy job (सिर्फ main + non-PR): provision → wildcard DNS → D1 migrations → shared worker → dedicated workers

## Dedicated worker provisioning (SuperAdmin)

SuperAdmin कंसोल में स्कूल की row पर "प्रोविजन" बटन से POST /api/admin/schools/provision कॉल होता है:
- schools.json (Tenant registry) में school entry mode: "dedicated" + slug/domain जोड़ता है
- GITHUB_TOKEN (PAT) से main branch पर commit करता है → deploy.yml → provision-school.mjs → D1/R2/KV + dedicated deploy
- school_tenants में provisioning_status track होता है; POST /api/admin/schools/provision/check से live status जाँचा जाता है

GITHUB_TOKEN worker secret के लिए repo में PROVISIONING_GITHUB_TOKEN नाम का PAT secret चाहिए
(fine-grained PAT, Contents: Read and write, इसी repo पर)। Built-in GITHUB_TOKEN जॉब खत्म होते ही
expire हो जाता है, इसलिए long-lived PAT आवश्यक है।

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
