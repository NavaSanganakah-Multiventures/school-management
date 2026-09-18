# VidyaSetu School Management System & CRM (Pragnya Mitra)

Multi-tenant school management platform built on Cloudflare Workers for Platforms (WfP).
यह single repo, single codebase है — कोई school-specific fork या hardcoded condition नहीं।

## Architecture (WfP only)

- Shared / control-plane worker: pragnya.nasven.com
  - SuperAdmin console, billing, plugin marketplace, school provisioning
- Dedicated / data-plane workers: <slug>.pragnya.nasven.com
  - Director, Principal, Teacher, Staff, Student (school-scoped data)
- Routing: Workers for Platforms dispatch namespace (school-management-dispatch)
  + dispatcher worker (dispatcher/)
- Plain Workers use नहीं होते — केवल WfP dispatch namespace।

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
- scripts/        WfP provisioning + deploy helpers
- dispatcher/     WfP dispatcher worker
- schools.json    Tenant registry (source of truth for dedicated deploy)

## Local development

    npm install
    npm run dev

Checks: npm run lint | npm run typecheck | npm run build

## Secrets (env से, plaintext नहीं)

- AUTH_SECRET — HMAC session signing (>= 32 chars, required)
- PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD — first SuperAdmin bootstrap
- CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID — WfP provisioning + deploy
- RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET — payments
- FCM_SERVICE_ACCOUNT_JSON / WEB_PUSH_VAPID_PRIVATE_KEY / FIREBASE_WEB_CONFIG_JSON — push
- GEMINI_API_KEY — optional platform AI fallback
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
- deploy job (सिर्फ main + non-PR): provision → dispatch namespace → D1 migrations → shared worker → dispatcher worker → dedicated workers

## Notes

- Migrations idempotent (CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE) और composite (school_id, ...) indexes के साथ।
