# VidyaSetu School Management — Multi-Tenant Deployment Architecture
## एक ही Repository, दो-स्तरीय Delivery: Shared + Dedicated

यह document VidyaSetu school-management system की पूरी working architecture और deployment प्रक्रिया को समझाता है। इसका उद्देश्य एक ही codebase से दो तरह से schools को सेवा देना है:

1. **Shared model** — सस्ता व सरल (कई schools एक ही worker पर)।
2. **Dedicated model** — Enterprise (हर school का अपना worker, database, storage)।

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
| लागत | कम | अधिक (isolation की कीमत) |

## 3. Plan ↔ Model Mapping

- **Enterprise** plan → dedicatedWorker: true → school को dedicated worker और dedicated resources मिलते हैं।
- **Trial / Starter / Pro** → dedicatedWorker: false → school shared worker पर चलता है।
- Super Admin जब किसी school को Enterprise plan approve करता है, तब वह school dedicated mode में चला जाता है।

## 4. School Registry (schools.json)

यह file पूरे system की source of truth है। इसमें shared worker की जानकारी और हर school का mode व resources होते हैं।

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

## 5. System कैसे काम करता है

### 5.1 Request Flow (Shared School)

1. User ब्राउज़र में **pragnya.nasven.com** खोलता है।
2. Request shared worker (**school-management**) पर जाता है।
3. Login के बाद user का school_id session/token से मिलता है।
4. सारे API calls में school_id filter लगता है (shared D1 में multi-tenant data)।
5. सिर्फ उसी school का data दिखता और बदलता है।

### 5.2 Request Flow (Dedicated School)

1. User ब्राउज़र में **(slug).pragnya.nasven.com** खोलता है।
2. Request उस school के अपने worker (**school-management-(slug)**) पर जाता है।
3. Worker का env.SCHOOL_ID और env.SCHOOL_SLUG fixed होता है।
4. सारा data उस school के अपने D1/R2/KV में रहता है।
5. दूसरे school का data physically उस worker/DB में होता ही नहीं।

### 5.3 Plugin Loading

- Plugin Marketplace से school जो plugin activate करता है, वह उसके DB (shared या dedicated) में school_plugins table में record बनता है।
- Frontend shell PLUGINS_REGISTRY से plugin के navItems, routes और widgets dynamically inject करता है।
- core shell में कोई hardcoded if-statement नहीं होता।

## 6. Deployment Pipeline (CI/CD)

GitHub Actions (**.github/workflows/deploy.yml**) — main branch पर push होते ही:

**Step 1 — Provision (सिर्फ dedicated schools)**
- schools.json पढ़ता है।
- जिन dedicated schools के resource IDs गायब हैं, उनके लिए:
  - wrangler d1 create school-management-(slug)-db
  - wrangler r2 bucket create school-management-(slug)-media
  - wrangler kv namespace create school-management-(slug)-config
- मिले IDs वापस schools.json में commit होते हैं।
- generate-school-configs.mjs हर dedicated school का wrangler-(slug).toml बनाता है।

**Step 2 — Build**
- एक बार npm install + npm run build।
- shared और dedicated दोनों के लिए same bundle।

**Step 3 — Shared Deploy**
- wrangler deploy (shared worker school-management)।
- D1 migrations apply।
- platform के common secrets set होते हैं।
- सभी shared schools pragnya.nasven.com पर update हो जाते हैं।

**Step 4 — Dedicated Matrix Deploy**
- हर dedicated school के लिए:
  - wrangler d1 migrations apply DB --remote -c wrangler-(slug).toml
  - wrangler deploy -c wrangler-(slug).toml
  - उस school के अपने secrets set (RAZORPAY, FCM आदि)
- हर school अपने (slug).pragnya.nasven.com पर update होता है।

## 7. Auto-Provisioning (नया Dedicated School)

नया dedicated school बनाने की प्रक्रिया:

1. Super Admin school को Enterprise plan approve करता है।
2. schools.json में mode: "dedicated" entry जोड़ी जाती है।
3. CI का Provision step अपने-आप D1/R2/KV बनाता है।
4. worker deploy + migrations + secrets अपने-आप होते हैं।
5. school (slug).pragnya.nasven.com पर live हो जाता है।

## 8. Secrets Management

- **Shared worker**: platform के common secrets (AUTH_SECRET, RAZORPAY, FCM, WEB_PUSH आदि) GitHub secrets से आते हैं।
- **Dedicated worker**: हर school के अपने secrets, GitHub secrets में (SECRET)_(SLUG) नाम से रखे जाते हैं (जैसे RAZORPAY_KEY_ID_GREENWOOD)।
- ज़रूरत पड़ने पर dedicated school को कुछ specific secrets अलग से भी दिए जा सकते हैं।

## 9. Domains & Routing

- Base domain: **nasven.com**
- Shared: **pragnya.nasven.com**
- Dedicated: **(slug).pragnya.nasven.com**
- dedicated worker के wrangler config में route/custom_domain (slug).pragnya.nasven.com set होता है।
- pragnya.nasven.com और *.pragnya.nasven.com Cloudflare zone पर होने चाहिए।
- Cloudflare API token में Workers + Custom Domains/Routes की permission चाहिए।

## 10. Plugin Architecture

- Plugins पूरी तरह core से decoupled (WordPress-style) हैं।
- Backend: api/plugins/index.ts + DB tables (plugins, school_plugins)।
- Frontend: plugins/index.ts का PLUGINS_REGISTRY।
- नया plugin बनाने के लिए:
  1. plugins/(plugin-name)/ folder बनाएँ (screen/widget)।
  2. db_migrations में migration से plugin register करें।
  3. api/(plugin-name)/ बनाकर api/index.ts में route register करें।
  4. plugins/index.ts में PLUGINS_REGISTRY में entry जोड़ें।
- एक deploy के बाद plugin सभी schools (shared और dedicated दोनों) में उपलब्ध हो जाता है।

## 11. नया School जोड़ने की प्रक्रिया

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

## 12. Downgrade नीति (Enterprise → Shared)

अगर कोई school Enterprise plan छोड़ता है:

1. school का data dedicated D1 से shared D1 में add/merge किया जाता है।
2. school को shared worker पर लाया जाता है।
3. Enterprise-level features हट जाते हैं (shared plan में उपलब्ध नहीं)।
4. dedicated worker/D1/R2/KV बाद में delete या freeze किए जा सकते हैं।

## 13. Repository File Structure

- schools.json — school registry (source of truth)
- scripts/provision-school.mjs — नए dedicated school के resources auto-create
- scripts/generate-school-configs.mjs — registry से wrangler-(slug).toml generate
- .github/workflows/deploy.yml — CI/CD pipeline
- wrangler.toml — shared worker config
- api/ — Hono API (core backend)
- app/ + components/ — Next.js frontend
- plugins/ — plugin system (frontend)
- db_migrations/ — D1 migrations
- docs/multitenant-deploy.md — यह document

## 14. Cloudflare Resources Overview

**Shared:**
- Worker: school-management
- D1: school-management (shared)
- R2: school-management-production (shared)
- KV: CONFIG_KV (shared)

**Dedicated (हर school के लिए):**
- Worker: school-management-(slug)
- D1: school-management-(slug)-db
- R2: school-management-(slug)-media
- KV: school-management-(slug)-config

## 15. Roadmap / आगे के चरण

1. schools.json + scripts + deploy.yml workflow बनाना।
2. Enterprise plan में dedicatedWorker flag जोड़ना।
3. Worker में SCHOOL_ID/SCHOOL_SLUG context पढ़ना।
4. Downgrade के लिए data migration script बनाना।
5. (वैकल्पिक) Super Admin UI से one-click provisioning।
