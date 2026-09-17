# VidyaSetu School Management — Multi-Tenant Deployment Architecture
## एक ही Repository, दो-स्तरीय Delivery (Cloudflare Workers): Shared + Dedicated

यह document VidyaSetu school-management system की पूरी working architecture और deployment प्रक्रिया समझाता है। इसका उद्देश्य एक ही codebase से दो तरह से schools को सेवा देना है:

1. **Shared model** — सस्ता व सरल (Trial/Starter/Pro schools एक ही worker पर)।
2. **Dedicated model** — Enterprise (हर school का अपना worker + database + storage)।

**दोनों tiers Cloudflare Workers पर ही चलते हैं** — platform के लिए एक worker और हर dedicated school के लिए एक अलग worker। सब एक ही repository और एक ही code से deploy होते हैं।

---

## 1. मुख्य सिद्धांत

- एक repository, एक codebase (core + plugins)।
- core code और plugins सभी schools के लिए common रहते हैं।
- code में किया गया कोई भी बदलाव सभी schools (shared और dedicated दोनों) में अपने-आप पहुँचता है।
- डेटा isolation का स्तर school के plan से तय होता है।

## 2. दो Delivery Models

| विशेषता | Shared | Dedicated |
|---|---|---|
| Plans | Trial, Starter, Pro | Enterprise |
| Worker | सभी schools एक ही worker | हर school का अपना worker |
| D1 Database | Shared | अपना अलग D1 |
| R2 Bucket | Shared | अपना अलग R2 bucket |
| KV Namespace | Shared | अपना अलग KV |
| Domain | pragnya.nasven.com | (slug).pragnya.nasven.com |
| Secrets | platform common | school के अपने |
| Payment gateway | platform की keys | school की अपनी keys |
| Control plane | यहीं (platform) | platform से proxy |
| लागत | कम | अधिक (isolation की कीमत) |

## 3. Plan ↔ Model Mapping

- **Enterprise** plan → dedicatedWorker: true → school को dedicated worker और dedicated resources मिलते हैं।
- **Trial / Starter / Pro** → dedicatedWorker: false → school shared worker पर चलता है।
- Super Admin जब किसी school को Enterprise plan approve करता है, तब वह school dedicated mode में चला जाता है।

यह flag तीन जगह एक साथ रखना होगा (single source of truth डेटाबेस है):
1. api/db.ts के SUBSCRIPTION_PLANS array में enterprise के featureFlags में dedicatedWorker: true।
2. api/lib/plan-access.ts के PLAN_ACCESS fallback में dedicatedWorker: true।
3. D1 की subscription_plans table के feature_flags JSON column में dedicatedWorker: true (एक नई migration से)।

## 4. School Registry (schools.json)

यह file पूरे deployment की source of truth है। इसमें shared worker की जानकारी और हर school का mode व resources होते हैं।

    {
      "sharedWorker": {
        "name": "school-management",
        "domain": "pragnya.nasven.com"
      },
      "schools": [
        {
          "slug": "vidyasetu",
          "schoolId": "school-tenant-id-1",
          "mode": "shared"
        },
        {
          "slug": "greenwood",
          "schoolId": "school-tenant-id-2",
          "mode": "dedicated",
          "domain": "greenwood.pragnya.nasven.com",
          "d1DatabaseId": "d1-xxxx-xxxx",
          "r2BucketName": "school-management-greenwood-media",
          "kvNamespaceId": "kv-yyyy-yyyy"
        }
      ]
    }

- mode: "shared" → school shared worker पर चलता है, कोई extra infrastructure नहीं।
- mode: "dedicated" → school का अपना worker, D1, R2, KV और domain।

## 5. Platform (Control Plane) vs School (Operational) Data

सबसे important architectural सिद्धांत: **platform-level tables सिर्फ़ shared/platform worker के D1 में रहती हैं**। dedicated worker का D1 सिर्फ़ उस school का operational data रखता है।

**Platform (shared worker के D1) में रहता है:**
- platform_admins
- school_tenants
- school_subscriptions
- billing_invoices
- plugins (global catalog)
- school_plugins (कौन सा school कौन सा plugin use करता है)
- subscription_plans

**Dedicated worker के D1 में रहता है (सिर्फ़ operational data):**
- school_profile
- system_users (उस school के Director/Principal/Staff)
- students, staff, classes, class_teachers
- attendance, fees, exams, notices
- subjects, leave_applications, activity_logs
- notifications / fcm tokens

**इसका फ़ायदा:**
- Billing, plans, plugins और Super Admin console की एक ही source of truth रहती है (platform worker)।
- Dedicated worker हल्का और पूरी तरह school-scoped रहता है।
- Dedicated school का billing/plugin/admin data कभी भी दो जगह split नहीं होता।

## 6. System कैसे काम करता है

### 6.1 Request Flow (Shared School)

1. User ब्राउज़र में **pragnya.nasven.com** खोलता है।
2. Request shared worker (**school-management**) पर जाता है।
3. Login के बाद user का school_id signed token (JWT) से मिलता है।
4. सारे API calls में school_id filter लगता है (shared D1 में multi-tenant data)।
5. सिर्फ उसी school का data दिखता और बदलता है।

### 6.2 Request Flow (Dedicated School)

1. User ब्राउज़र में **(slug).pragnya.nasven.com** खोलता है।
2. Request उस school के अपने worker (**school-management-(slug)**) पर जाता है।
3. Worker का env.SCHOOL_ID और env.SCHOOL_SLUG fixed होता है।
4. सारा operational data उस school के अपने D1/R2/KV में रहता है।
5. दूसरे school का data physically उस worker/DB में होता ही नहीं।
6. Billing / Plans / Plugins / Admin जैसे platform routes **platform worker को proxy** करते हैं।

### 6.3 Plugin Loading

- Plugin catalog और school_plugins subscription platform D1 में रहते हैं।
- Dedicated worker का /api/plugins/* route platform API से पढ़कर response देता है (proxy)।
- Frontend shell PLUGINS_REGISTRY से plugin के navItems, routes और widgets dynamically inject करता है।
- core shell में कोई hardcoded if-statement नहीं होता।

## 7. Security & School Isolation

Dedicated mode में isolation की पूरी गारंटी के लिए ये rules apply होंगे:

- Worker का env.SCHOOL_ID ही हमेशा school माना जाएगा; request header से कोई दूसरा school override नहीं होगा।
- verifyToken के बाद authUser.schoolId !== env.SCHOOL_ID हो तो request reject (401/403)।
- हर dedicated worker का अपना AUTH_SECRET होगा, ताकि shared worker का token dedicated worker पर valid न हो।
- X-School-Id header सिर्फ़ SuperAdmin के लिए accept होगा। बाकी users का schoolId सिर्फ़ JWT से लिया जाएगा।
- getRequestSchoolId() का fallback "school-01" dedicated mode में हट जाएगा।
- Super Admin login सिर्फ़ platform worker पर होगा; dedicated worker पर platform_admins check empty रहेगा।

## 8. Single Build + Runtime Config

सभी schools के लिए **एक ही frontend build** रखने के लिए school-specific client config build-time पर bake नहीं होगी:

- Firebase / FCM web config अभी NEXT_PUBLIC_FIREBASE_WEB_CONFIG_JSON से build-time पर बनती है — इसे runtime पर /api/config जैसे endpoint से लाया जाएगा।
- Razorpay key id पहले से ही runtime पर /api/billing/razorpay/config से आती है (सही है)।
- इससे एक ही bundle (out/) shared और सभी dedicated schools दोनों के लिए काम करेगा।
- FCM service account जैसे private secrets हमेशा Worker side (env) में रहेंगे, client पर कभी नहीं आएँगे।

## 9. Deployment Pipeline (CI/CD)

GitHub Actions (**.github/workflows/deploy.yml**) — main branch पर push होते ही:

**Step 1 — Provision (सिर्फ़ dedicated schools)**
- schools.json पढ़ता है।
- जिन dedicated schools के resource IDs गायब हैं, उनके लिए wrangler से D1 / R2 / KV बनाता है।
- मिले IDs वापस schools.json में commit होते हैं।
- scripts/generate-school-configs.mjs हर dedicated school का wrangler-(slug).toml बनाता है।

**Step 2 — Build (एक बार)**
- npm install + npm run build।
- shared और dedicated दोनों के लिए same bundle।

**Step 3 — Platform / Shared Deploy**
- wrangler deploy (shared worker school-management)।
- D1 migrations apply।
- platform के common secrets set होते हैं।
- Super Admin bootstrap सिर्फ़ platform worker पर (https://pragnya.nasven.com/api/admin/bootstrap) चलता है।

**Step 4 — Dedicated Matrix Deploy**
- हर dedicated school के लिए:
  - wrangler d1 migrations apply DB --remote -c wrangler-(slug).toml
  - wrangler deploy -c wrangler-(slug).toml
  - उस school के अपने secrets set (RAZORPAY, FCM, AUTH_SECRET आदि)
- हर school अपने (slug).pragnya.nasven.com पर update होता है।

## 10. Auto-Provisioning (नया Dedicated School)

नया dedicated school बनाने की प्रक्रिया (दो चरणों में):

**चरण A — अभी (commit-based):**
1. Super Admin school को Enterprise plan approve करता है।
2. schools.json में mode: "dedicated" entry add की जाती है।
3. main branch पर push होते ही CI का Provision step D1/R2/KV अपने-आप बनाता है।
4. worker deploy + migrations + secrets अपने-आप होते हैं।
5. school (slug).pragnya.nasven.com पर live हो जाता है।

**चरण B — बाद में (Super Admin UI से one-click):**
- platform worker को एक GITHUB_TOKEN secret दिया जाएगा।
- Super Admin console से "Provision" button platform worker को GitHub workflow dispatch करने देगा।
- इससे schools.json manually edit किए बिना ही provisioning हो जाएगी।

## 11. Secrets Management

- **Shared / platform worker**: platform के common secrets (AUTH_SECRET, RAZORPAY, FCM, WEB_PUSH आदि) GitHub secrets से आते हैं।
- **Dedicated worker**: हर school के अपने secrets, GitHub secrets में SECRET_SLUG नाम से रखे जाते हैं (जैसे RAZORPAY_KEY_ID_GREENWOOD, AUTH_SECRET_GREENWOOD)।
- ज़रूरत पड़ने पर dedicated school को कुछ specific secrets अलग से भी दिए जा सकते हैं।

## 12. Domains & Routing

- Base domain: **nasven.com**
- Shared: **pragnya.nasven.com**
- Dedicated: **(slug).pragnya.nasven.com**
- dedicated worker के wrangler config में custom_domain (slug).pragnya.nasven.com set होता है।
- pragnya.nasven.com और *.pragnya.nasven.com Cloudflare zone पर होने चाहिए।
- Cloudflare API token में Workers + Custom Domains/Routes की permission चाहिए।

**Migration note:** अभी repo में पुराने domains reference हैं — wrangler.toml का APP_BASE_URL (pragnya.navasanganakah.com) और deploy.yml का bootstrap URL (school-management.nssite.workers.dev)। इन्हें हटाकर सिर्फ़ nasven.com tree रखना है।

## 13. Plugin Architecture

- Plugins पूरी तरह core से decoupled (WordPress-style) हैं।
- Backend: api/plugins/index.ts + DB tables (plugins, school_plugins) — ये platform worker पर रहती हैं।
- Frontend: plugins/index.ts का PLUGINS_REGISTRY।
- नया plugin बनाने के लिए:
  1. plugins/(plugin-name)/ folder बनाएँ (screen/widget)।
  2. db_migrations में migration से plugin register करें।
  3. api/(plugin-name)/ बनाकर api/index.ts में route register करें।
  4. plugins/index.ts में PLUGINS_REGISTRY में entry जोड़ें।
- एक deploy के बाद plugin सभी schools (shared और dedicated दोनों) में उपलब्ध हो जाता है।

## 14. नया School जोड़ने की प्रक्रिया

**Shared School:**
1. School register/approve होता है।
2. school_tenants में row बनती है।
3. तुरंत shared worker (pragnya.nasven.com) पर उपलब्ध।
4. कोई deploy आवश्यक नहीं।

**Dedicated School:**
1. Enterprise plan subscribe/approve।
2. schools.json में dedicated entry।
3. CI auto-provision → worker + D1 + R2 + KV + domain + secrets।
4. school अपने subdomain पर live।

## 15. Downgrade नीति (Enterprise → Shared)

अगर कोई school Enterprise plan छोड़ता है:

1. school का operational data dedicated D1 से shared D1 में add/merge किया जाता है।
2. merge के समय ID collision से बचने के लिए mapping रखी जाती है (school-/usr-/sub-/binv- prefixed IDs)।
3. school को shared worker पर लाया जाता है और school_tenants की plan_id / mode update होती है।
4. Enterprise-level features हट जाते हैं (multiSchool, customDomain, dedicatedWorker)।
5. dedicated worker/D1/R2/KV बाद में delete या freeze किए जा सकते हैं।
6. यह merge scripts/downgrade-school.mjs से run होगा (बाद में बनेगा)।

## 16. Repository File Structure

- schools.json — school registry (source of truth)
- scripts/provision-school.mjs — नए dedicated school के resources auto-create
- scripts/generate-school-configs.mjs — registry से wrangler-(slug).toml generate
- scripts/downgrade-school.mjs — dedicated से shared data merge (बाद में)
- .github/workflows/deploy.yml — CI/CD pipeline
- wrangler.toml — platform/shared worker config
- wrangler-(slug).toml — dedicated worker config (generated)
- api/ — Hono API (core backend)
- app/ + components/ — Next.js frontend
- plugins/ — plugin system (frontend)
- db_migrations/ — D1 migrations
- docs/multitenant-deploy.md — यह document

## 17. Cloudflare Resources Overview

**Platform / Shared:**
- Worker: school-management
- D1: school-management (shared)
- R2: school-management-production (shared)
- KV: CONFIG_KV (shared)

**Dedicated (हर school के लिए):**
- Worker: school-management-(slug)
- D1: school-management-(slug)-db
- R2: school-management-(slug)-media
- KV: school-management-(slug)-config

## 18. Current State / Cleanup

दो-स्तरीय system में जाते समय ये cleanup करना है:

- APP_BASE_URL और bootstrap URL को nasven.com tree पर standardize करना।
- workers.dev (nssite.workers.dev) bootstrap हटाकर custom domain pragnya.nasven.com use करना।
- X-School-Id header का scope सिर्फ़ SuperAdmin तक सीमित करना।
- Firebase web config को build-time से हटाकर runtime config पर लाना।
- dedicated worker के /billing, /plugins, /admin routes platform proxy पर लाना।

## 19. Roadmap / आगे के चरण

1. schools.json + scripts (provision/generate-configs) बनाना।
2. .github/workflows/deploy.yml को two-tier matrix में update करना।
3. Enterprise plan में dedicatedWorker flag जोड़ना (code + migration)।
4. Worker में SCHOOL_ID/SCHOOL_SLUG context और school-isolation enforcement।
5. Firebase web config runtime endpoint (/api/config)।
6. Downgrade के लिए data migration script बनाना।
7. (वैकल्पिक) Super Admin UI से one-click provisioning (GITHUB_TOKEN के साथ)।