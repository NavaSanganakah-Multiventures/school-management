# Pragnya Mitra School Management — Multi-Tenant Delivery Architecture
## एक ही Repository, एक ही Codebase · Cloudflare Workers · Dedicated-by-Default

यह document Pragnya Mitra school-management system की पूरी working architecture और deployment प्रक्रिया समझाता है। लक्ष्य: **एक ही codebase** से schools को serve करना, ताकि खर्च कम रहे, isolation पूरा रहे और custom/special features **plugin के रास्ते** से managed हों।

### मुख्य निर्णय (locked decisions)

- **एक repository**: `NavaSanganakah-Multiventures/school-management`। कोई school-specific fork नहीं।
- **एक core codebase + plugin architecture**। अगर कोई school कोई special/custom feature माँगता है, तो उसका **managed plugin** बनाया जाएगा — core fork नहीं।
- **Dedicated-by-Default** — हर school (चाहे Trial हो, Starter, Pro या Enterprise) का अपना dedicated worker + अपना D1/R2/KV + अपने secrets + अपना `(slug).pragnya.nasven.com` domain।
  - Shared worker सिर्फ़ **control plane** (SuperAdmin + School Director) और **wildcard fallback** (pending/unprovisioned schools) के रूप में रहता है।
- **Plain dedicated Cloudflare Workers** से provisioning और direct per-school `*.pragnya.nasven.com` routes।
- **Control plane (main worker)** और **Data plane (school worker)** अलग roles के साथ।
- **LMS dashboard = plugin/add-on** (advanced service)। Core में पहले student + teacher management।
- **Email quota** per school (business domain email) plan के हिसाब से।
- **Developer एवं AI Agent दिशानिर्देश:** कोड में काम करने और नए प्लगइन्स बनाने के विस्तृत नियम [.agents/rules/ai-instructions.md](file:///c:/Users/DHEERENDRA/Desktop/school-management/school-management/.agents/rules/ai-instructions.md) में परिभाषित हैं।

---

## 1. मुख्य सिद्धांत

- एक repository, एक codebase (core + plugins)।
- core code और plugins सभी schools के लिए common रहते हैं।
- code में किया गया कोई भी बदलाव सभी schools में अपने-आप पहुँचता है।
- **data isolation हर school के लिए full** — हर school का अपना worker + अपना D1/R2/KV (चाहे plan कुछ भी हो)।

## 2. Plain Dedicated Workers (direct routes) — क्यों?

Cloudflare Workers में **per-worker कोई fee नहीं** होती; हम अपने एक account में जितने चाहें worker रख सकते हैं। हर dedicated school को एक plain Cloudflare Worker मिलता है:

- हर dedicated worker का अपना `[[routes]]` (`<slug>.pragnya.nasven.com/*`) होता है।
- Cloudflare route table hostname देखकर सही worker को serve करता है — कोई अलग routing layer नहीं।
- Main (control plane) worker से **GitHub Actions के ज़रिए** नया school worker deploy किया जाता है — flow: *registration → approval/payment → worker तैयार*।
- हर school worker के अपने bindings (D1/R2/KV) और अपने secrets होते हैं — full isolation।
- **Cost**: workers के लिए कोई अलग per-worker charge नहीं; bill request/usage (D1/KV/R2) के हिसाब से आता है।

## 3. Delivery Models

| विशेषता | Shared (fallback/control plane) | Dedicated (हर school — default) |
|---|---|---|
| Plans | — (केवल pending/unprovisioned fallback) | Trial, Starter, Pro, Enterprise — सभी |
| Worker | सिर्फ़ `school-management` (platform) | हर school का अपना worker |
| D1 Database | Shared (platform tables) | अपना अलग D1 |
| R2 Bucket | Shared | अपना अलग R2 bucket |
| KV Namespace | Shared | अपना अलग KV |
| Domain | pragnya.nasven.com | (slug).pragnya.nasven.com |
| Secrets | platform common | school के अपने |
| Payment gateway | platform की keys | school की अपनी keys |
| Control plane | यहीं (platform) | platform से proxy |
| लागत | कम | isolation की कीमत (per-worker कोई शुल्क नहीं) |

## 4. Plan ↔ Model Mapping

- **हर plan** (Trial / Starter / Pro / Enterprise) → `dedicatedWorker: true` → स्कूल का अपना dedicated worker और dedicated resources।
- Plan सिर्फ़ **features/limits** (students/staff/modules) तय करता है — **provisioning** नहीं।
- Super Admin जब किसी school को approve करता है या कोई plan assign करता है, तब वह school **auto-provision** होकर dedicated mode में चला जाता है।
- `dedicatedWorker` flag अब गेट नहीं है — यह सिर्फ़ UI display के लिए रखा गया है (हर plan पर true)।

flag तीन जगह एक साथ रखा जाता है (single source of truth database है):
1. `api/db.ts` के `SUBSCRIPTION_PLANS` array में हर plan के `featureFlags` में `dedicatedWorker: true`।
2. `api/lib/plan-access.ts` के `PLAN_ACCESS` fallback में हर plan पर `dedicatedWorker: true`।
3. D1 की `subscription_plans` table के `feature_flags` JSON column में हर plan पर `dedicatedWorker: true` (migration 0037)।

## 5. Control Plane + Data Plane (roles)

- **Main worker** (`pragnya.nasven.com`) — platform/control plane:
  - Roles: **SuperAdmin** और **School Director**।
  - यहीं registration, approval, billing/payment, plan management, provisioning, global plugin catalog होता है।
  - School Director यहीं अपने school का account/plan/billing manage करता है।
- **School worker** (`<slug>.pragnya.nasven.com`) — data plane (school operations):
  - Roles: **Director, Principal, Teacher, Staff, Student**।
  - **SuperAdmin का कोई role school worker में नहीं होता** — सारा school-scoped management Director/Principal करते हैं।
  - operational data: students, teachers, attendance, fees, exams, notices, etc.

## 6. School Registry (schools.json)

यह file पूरे deployment की source of truth है। इसमें shared worker की जानकारी और हर school का mode, resources और email quota होता है।

```json
{
  "sharedWorker": {
    "name": "school-management",
    "domain": "pragnya.nasven.com"
  },
  "schools": [
    {
      "slug": "vidyasetu",
      "schoolId": "school-tenant-id-1",
      "mode": "dedicated",
      "name": "Vidyasetu",
      "domain": "vidyasetu.pragnya.nasven.com"
    },
    {
      "slug": "greenwood",
      "schoolId": "school-tenant-id-2",
      "mode": "dedicated",
      "domain": "greenwood.pragnya.nasven.com",
      "d1DatabaseId": "d1-xxxx-xxxx",
      "r2BucketName": "school-management-greenwood-media",
      "kvNamespaceId": "kv-yyyy-yyyy",
      "emailQuota": 5000
    }
  ]
}
```

- `mode: "dedicated"` → school का अपना worker, D1, R2, KV, domain और secrets (default — har school के लिए)।
- `mode: "shared"` → केवल ऐसे schools के लिए जो अभी provisioned नहीं हैं (transient fallback / emergency deprovision)।

## 7. Platform (Control Plane) vs School (Operational) Data

सबसे important architectural सिद्धांत: **platform-level tables सिर्फ़ main/platform worker के D1 में रहती हैं**। dedicated worker का D1 सिर्फ़ उस school का operational data रखता है।

**Platform (main worker के D1) में रहता है:**
- `platform_admins`
- `school_tenants`
- `school_subscriptions`
- `billing_invoices`
- `plugins` (global catalog)
- `school_plugins` (कौन सा school कौन सा plugin use करता है)
- `subscription_plans`

**Dedicated worker के D1 में रहता है (सिर्फ़ operational data):**
- `school_profile`
- `system_users` (उस school के Director/Principal/Staff/Teacher/Student)
- `students`, `staff`, `classes`, `class_teachers`
- `attendance`, `fees`, `exams`, `notices`
- `subjects`, `leave_applications`, `activity_logs`
- `notifications` / `fcm_tokens`

**इसका फ़ायदा:**
- Billing, plans, plugins और Super Admin console की एक ही source of truth रहती है (platform worker)।
- Dedicated worker हल्का और पूरी तरह school-scoped रहता है।
- Dedicated school का billing/plugin/admin data कभी दो जगह split नहीं होता।

> **Migration note:** जब कोई school shared→dedicated जाता है तो उसका operational data
> `scripts/migrate-to-dedicated.mjs` (deploy-dedicated.mjs के अंदर) से shared D1 → dedicated D1
> copy होता है — **fail-loud**: अगर copy fail हो, तो उस school का deploy रुक जाता है और school
> wildcard fallback पर shared mode में चलता रहता है (कुछ नहीं टूटता)।

## 8. System कैसे काम करता है (request flows)

### 8.1 Request Flow (Shared School)

1. User browser में **pragnya.nasven.com** खोलता है।
2. Request main worker (**school-management**) पर जाता है।
3. Login के बाद user का `school_id` signed token (JWT) से मिलता है।
4. सारे API calls में `school_id` filter लगता है (shared D1 में multi-tenant data)।
5. सिर्फ़ उसी school का data दिखता और बदलता है।

### 8.2 Request Flow (Dedicated School)

1. User browser में **(slug).pragnya.nasven.com** खोलता है।
2. Request उस school के अपने dedicated worker route से उसके worker पर पहुँचता है।
3. Worker का `env.SCHOOL_ID` और `env.SCHOOL_SLUG` fixed होता है।
4. सारा operational data उस school के अपने D1/R2/KV में रहता है।
5. दूसरे school का data physically उस worker/DB में होता ही नहीं।
6. Billing / Plans / Plugins / Admin जैसे platform routes **platform worker को proxy** करते हैं।

### 8.3 Plugin Loading

- Plugin catalog और `school_plugins` subscription platform D1 में रहते हैं।
- Dedicated worker का `/api/plugins/*` route platform API से पढ़कर response देता है (proxy)।
- Frontend shell `PLUGINS_REGISTRY` से plugin के navItems, routes और widgets dynamically inject करता है।
- core shell में कोई hardcoded if-statement नहीं होता।

## 9. Plugin Architecture + LMS as add-on

- Plugins पूरी तरह core से decoupled (WordPress-style) हैं।
- Backend: `api/plugins/index.ts` + DB tables (`plugins`, `school_plugins`) — ये platform worker पर रहते हैं।
- Frontend: `plugins/index.ts` का `PLUGINS_REGISTRY`।
- नया plugin बनाने के लिए:
  1. `plugins/(plugin-name)/` folder बनाएँ (screen/widget)।
  2. `db_migrations` में migration से plugin register करें।
  3. `api/(plugin-name)/` बनाकर `api/index.ts` में route register करें।
  4. `plugins/index.ts` में `PLUGINS_REGISTRY` में entry जोड़ें।
- एक deploy के बाद plugin सभी schools (shared और dedicated दोनों) में उपलब्ध हो जाता है।

**LMS Dashboard = plugin (advanced service / add-on):**
- Core में सिर्फ़ student management + teacher management (और ज़रूरी school operations)।
- LMS dashboard `plugin-lms` के रूप में रहेगा — plan/add-on के हिसाब से `school_plugins` से activate होगा।
- जिस school ने LMS नहीं लिया, उसके UI/worker पर LMS का load नहीं पड़ेगा।

## 10. Email quota (business domain)

- हर school को अपने business domain से email भेजने की सुविधा मिलेगी।
- Plan के हिसाब से **monthly email quota** track होगा (जैसे Trial: limited, Starter: 500, Pro: 2000, Enterprise: custom)।
- Email provider integration से भेजा जाएगा; quota `school_subscriptions` में store होगा।
- Dedicated school के अपने email domain + अपने sender credentials होंगे।

## 11. Performance — D1 पर load कम + queries fast

सिर्फ़ "अलग DB" होना ही fast queries की गारंटी नहीं है। साथ में यह करना है:

- D1 में सही **indexes** और **`school_id` composite keys** हर shared table पर।
- हर query में `school_id` scoping — ताकि index hit हो और cross-tenant scan न हो।
- Hot/frequently-read data **KV cache** में रखना।
- Media/files **R2** में (D1 में नहीं)।
- Heavy read endpoints cached (सिर्फ़ school-scoped cache keys)।
- Dedicated school = अपना D1, इसलिए एक school का load दूसरे school की query पर असर नहीं डालता।

## 12. Security & School Isolation

Dedicated mode में isolation की पूरी गारंटी के लिए ये rules apply होंगे:

- Worker का `env.SCHOOL_ID` ही हमेशा school माना जाएगा; request header से कोई दूसरा school override नहीं होगा।
- `verifyToken` के बाद `authUser.schoolId !== env.SCHOOL_ID` हो तो request reject (401/403)।
- हर dedicated worker का अपना `AUTH_SECRET` होगा, ताकि shared worker का token dedicated worker पर valid न हो।
- `X-School-Id` header सिर्फ़ SuperAdmin के लिए accept होगा; बाकी users का schoolId सिर्फ़ JWT से लिया जाएगा।
- `getRequestSchoolId()` का fallback `"school-01"` dedicated mode में हट जाएगा।
- Super Admin login सिर्फ़ platform worker पर होगा; dedicated worker पर `platform_admins` check empty रहेगा।

## 13. Single Build + Runtime Config

सभी schools के लिए **एक ही frontend build** रखने के लिए school-specific client config build-time पर bake नहीं होगी:

- Firebase / FCM web config build-time `NEXT_PUBLIC_FIREBASE_WEB_CONFIG_JSON` से हटाकर runtime `/api/config` endpoint से लाया जाएगा।
- Razorpay key id पहले से ही runtime `/api/billing/razorpay/config` से आती है (सही है)।
- इससे एक ही bundle (`out/`) shared और सभी dedicated schools दोनों के लिए काम करेगा।
- FCM service account जैसे private secrets हमेशा Worker side (`env`) में रहेंगे, client पर कभी नहीं आएँगे।

## 14. Provisioning (Dedicated Workers — default for every school)

### नया School (create / approve / plan-assign / payment)
1. School register होता है → `school_tenants` में row बनती है।
2. Approve/create/plan-assign/payment पर main (control plane) worker **auto-provision** करता है (कोई plan gate नहीं — plan चाहे trial/starter/pro/enterprise, हर school को अपना worker मिलता है):
   - schools.json में `mode: "dedicated"` commit।
   - D1 database + R2 bucket + KV namespace बनाना (scripts/provision-school.mjs)।
   - school worker (अपने `[[routes]]` के साथ) generate + deploy करना (scripts/generate-school-configs.mjs + deploy-dedicated.mjs)।
   - `AUTH_SECRET`, Razorpay keys, email credentials जैसे secrets set करना।
   - `(slug).pragnya.nasven.com` route बनाना।
3. Deploy से पहले `scripts/migrate-to-dedicated.mjs` shared D1 में बचा हुआ operational data (अगर कोई हो) dedicated D1 में copy करता है (idempotent; data already present हो तो skip)।
4. schema migrations apply।
5. School अपने subdomain पर live।

CI/CD (GitHub Actions) में main branch पर push होते ही:
- build एक बार होता है (सभी dedicated schools के लिए same bundle)।
- `ensure-wildcard-dns.mjs` wildcard DNS record को idempotent ensure करता है।
- platform/shared worker deploy होता है (wildcard route `*.pragnya.nasven.com` के साथ — सिर्फ़ control plane + fallback)।
- हर dedicated school के लिए provision + config generate + `deploy-dedicated.mjs` (migrations → data copy → worker deploy)।

## 15. Secrets Management

- **Shared / platform worker**: platform के common secrets (`AUTH_SECRET`, `RAZORPAY`, `FCM`, `WEB_PUSH` आदि) GitHub secrets से आते हैं।
- **Dedicated worker**: हर school के अपने secrets, GitHub secrets में `SECRET_SLUG` नाम से रखे जाते हैं (जैसे `RAZORPAY_KEY_ID_GREENWOOD`, `AUTH_SECRET_GREENWOOD`)।
- ज़रूरत पड़ने पर dedicated school को कुछ specific secrets अलग से भी दिए जा सकते हैं।

## 16. Domains & Routing

- Base domain: **nasven.com**
- Shared/platform (control plane): **pragnya.nasven.com**
- Dedicated (default — हर school): **(slug).pragnya.nasven.com**
- `pragnya.nasven.com` और `*.pragnya.nasven.com` Cloudflare zone पर होने चाहिए।
- `*.pragnya.nasven.com` wildcard route shared worker (`school-management`) पर जाता है — **fallback के तौर पर** (pending/unprovisioned schools) और control plane के लिए; dedicated schools के specific `(slug).pragnya.nasven.com` routes हमेशा उनके अपने worker को serve करते हैं (precedence Cloudflare route table देता है)।
- Cloudflare API token में Workers + Custom Domains/Routes की permission चाहिए।

**Migration note:** repo में पुराने domains reference हैं — `wrangler.toml` का `APP_BASE_URL` (`pragnya.navasanganakah.com`) और `deploy.yml` का bootstrap URL (`school-management.nssite.workers.dev`)। इन्हें हटाकर सिर्फ़ nasven.com tree रखना है।

## 17. Downgrade नीति (Dedicated → Shared — सिर्फ़ आपातकालीन)

Dedicated-by-default policy में **कोई स्वचालित downgrade नहीं होता** — plan बदलने पर school dedicated ही रहता है। सिर्फ़ आपातकालीन स्थिति में (Super Admin मैन्युअल रूप से):

1. school का operational data dedicated D1 से shared D1 में add/merge किया जाता है (`scripts/downgrade-school.mjs`)।
2. merge के समय ID collision से बचने के लिए mapping रखी जाती है (`school-`/`usr-`/`sub-`/`binv-` prefixed IDs)।
3. school को shared worker पर लाया जाता है और `school_tenants` की `plan_id` / `mode` update होती है।
4. dedicated worker/D1/R2/KV बाद में delete या freeze किए जा सकते हैं।

> यह केवल emergency/cleanup action है — नियमित plan downgrade पर school अपने dedicated worker पर ही चलता है।

## 18. Repository File Structure

- `schools.json` — school registry (source of truth)
- `scripts/provision-school.mjs` — हर dedicated school के D1/R2/KV resources auto-create (idempotent)
- `scripts/ensure-wildcard-dns.mjs` — wildcard DNS record idempotent ensure (REST API)
- `scripts/generate-school-configs.mjs` — registry से per-school dedicated worker config (`wrangler-<slug>.toml`) generate (अपने `[[routes]]` के साथ)
- `scripts/deploy-dedicated.mjs` — dedicated worker को सीधे deploy (migrations → shared→dedicated data copy → secrets → deploy)
- `scripts/migrate-to-dedicated.mjs` — shared→dedicated operational data copy (fail-loud, idempotent)
- `scripts/downgrade-school.mjs` — dedicated से shared data merge (सिर्फ़ आपातकालीन)
- `.github/workflows/deploy.yml` — CI/CD pipeline
- `wrangler.toml` — platform/shared worker config
- `api/` — Hono API (core backend)
- `app/` + `components/` — Next.js frontend
- `plugins/` — plugin system (frontend) + `api/plugins/` (backend)
- `db_migrations/` — D1 migrations
- `docs/multitenant-deploy.md` — यह document

## 19. Cloudflare Resources Overview

**Platform / Shared:**
- Worker: `school-management`
- D1: `school-management` (shared)
- R2: `school-management-production` (shared)
- KV: `CONFIG_KV` (shared)

**Dedicated (हर school के लिए):**
- Worker (direct, अपने route के साथ): `(slug)`
- D1: `school-management-(slug)-db`
- R2: `school-management-(slug)-media`
- KV: `school-management-(slug)-config`

## 20. Current State / Cleanup

दो-स्तरीय system में जाते समय यह cleanup करना है:

- `APP_BASE_URL` और bootstrap URL को nasven.com tree पर standardize करना।
- `workers.dev` (`nssite.workers.dev`) bootstrap हटाकर custom domain `pragnya.nasven.com` use करना।
- `X-School-Id` header का scope सिर्फ़ SuperAdmin तक सीमित करना।
- Firebase web config को build-time से हटाकर runtime config पर लाना।
- dedicated worker के `/billing`, `/plugins`, `/admin` routes platform proxy पर लाना।

## 21. Roadmap / आगे के चरण

1. ✅ Dedicated-by-default: हर school का अपना worker (plan-gate हटाया, auto-provision on create/approve/plan-change/payment)।
2. ✅ `schools.json` + provisioning scripts को direct dedicated-worker deploy के हिसाब से बनाना।
3. ✅ `.github/workflows/deploy.yml` को per-school routes + provision step में update करना।
4. ✅ हर plan पर `dedicatedWorker` flag true (code + migration 0037)।
5. ✅ Worker में `SCHOOL_ID`/`SCHOOL_SLUG` context और school-isolation enforcement।
6. ✅ Roles split: main worker (SuperAdmin + Director) vs school worker (Director/Principal/Teacher/Staff/Student)।
7. ✅ Firebase web config runtime endpoint (`/api/config`)।
8. ✅ LMS dashboard plugin (`plugin-lms`) बनाना — core से बाहर, add-on के रूप में।
9. ✅ Email quota tracking + business-domain email integration।
10. ✅ Downgrade के लिए data migration script + shared→dedicated migration script।
11. ✅ Super Admin UI से one-click provisioning (auto + manual retry, deprovision emergency-only)।
