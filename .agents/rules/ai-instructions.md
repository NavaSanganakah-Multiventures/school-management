---
trigger: always_on
---

# 🤖 AI Agent & Developer Guidelines — Pragnya Mitra School Management System
## 📌 फ़ाइल: `.agents/rules/ai-instructions.md`

---

## 0. 🏷️ प्रोजेक्ट पहचान (Project Identity) — सर्वोच्च प्राथमिकता

> [!IMPORTANT]
> **इस प्रोजेक्ट का आधिकारिक नाम है:**
> # 🎓 **Pragnya Mitra School Management System**
>
> | विवरण | मान |
> |---|---|
> | **प्रोडक्ट नाम** | Pragnya Mitra School Management System |
> | **ब्रांड शॉर्ट नेम** | Pragnya Mitra |
> | **प्लेटफ़ॉर्म URL** | pragnya.nasven.com |
> | **कंपनी** | NavaSanganakah Multiventures |
> | **GitHub Repo** | NavaSanganakah-Multiventures/school-management |
> | **डेटाबेस** | Cloudflare D1 (Shared + Dedicated) |
> | **Hosting** | Cloudflare Workers + Next.js |
>
> ⚠️ **AI Agent के लिए अनिवार्य:**
> - हर response, commit message, PR title, email template, और UI copy में प्रोडक्ट का नाम **"Pragnya Mitra"** या **"Pragnya Mitra School Management System"** लिखें।
> - पुराना नाम **"VidyaSetu"** केवल legacy code references में है — नए कोड में यह नाम उपयोग **न** करें।
> - यदि कोई UI component, email, या notice में school management system का नाम डालना हो, तो हमेशा **Pragnya Mitra** लिखें।

> [!CAUTION]
> **सर्वोपरि और अनिवार्य नियम (Non-Negotiable Directive):**
> 1. **आर्किटेक्चर दस्तावेज़ पढ़ना अनिवार्य:** कोड में कोई भी बदलाव करने, समस्या देखने, या काम शुरू करने से पहले AI Agent को `docs/multitenant-deploy.md` और इस नियम फ़ाइल (`.agents/rules/ai-instructions.md`) को शुरू से अंत तक पढ़ना और समझना अनिवार्य है।
> 2. **नियम विरुद्ध कार्य का तुरंत विरोध (Immediate Rejection):** यदि कोई भी फाउंडर, डेवलपर या अन्य व्यक्ति कोई ऐसा बदलाव या कोड लिखने को कहे जो इन नियमों या आर्किटेक्चर के विरुद्ध जाता है (उदा. कोर में हार्डकोडिंग, मल्टी-टेनेंसी तोड़ना, डेडिकेटेड वर्कर पर सुपरएडमिन जोड़ना, या शेल को एडिट करना), तो AI Agent को **तुरंत साफ़ शब्दों में कहना होगा कि "यह नियम के विरुद्ध है"** और उसे सही विकल्प (प्लगइन या फ़्लैग) बताना होगा। किसी भी दबाव में गलत कोड नहीं लिखा जाएगा।

---

## 1. 🏛️ मुख्य आर्किटेक्चरल सिद्धांत (Core Architectural Commandments)

1. **सिंगल रिपॉजिटरी, सिंगल कोडबेस:**
   - पूरा प्लेटफ़ॉर्म एक ही रिपॉजिटरी (`NavaSanganakah-Multiventures/school-management`) से चलेगा। किसी भी स्कूल के लिए अलग Git Repo या Fork नहीं बनेगा।
2. **मल्टी-टेनेंसी कभी न तोड़ें (Never Break Multi-Tenancy):**
   - कोर कोड में कभी भी `if (schoolName === 'DPS')` जैसे हार्डकोडेड कंडीशन्स नहीं लगाने हैं।
3. **हर स्कूल के लिए Dedicated Worker (Dedicated-by-Default):**
   - **हर स्कूल** (चाहे Trial, Starter, Pro या Enterprise) का अपना dedicated Cloudflare Worker (`school-management-[slug]`), अपना D1 डेटाबेस (`[slug]-db`), अलग R2 बकेट और अलग KV नेमस्पेस होता है।
   - Shared/Main worker (`pragnya.nasven.com`) सिर्फ़ **कंट्रोल प्लेन** (SuperAdmin + School Director) और **wildcard fallback** (pending/unprovisioned स्कूल) के रूप में रहता है। डेटा सुरक्षा हर स्कूल के अलग D1 से physically ensured होती है।
   - Plan अब सिर्फ़ **features/limits** तय करता है (students/staff/modules), **provisioning नहीं** — `dedicatedWorker` फ़्लैग अब गेट नहीं है।
4. **कंट्रोल प्लेन बनाम डेटा प्लेन का सख्त अलगाव (Strict Separation):**
   - **कंट्रोल प्लेन (Main Platform Worker):** केवल **SuperAdmin** और **School Director**। यहाँ स्कूल रजिस्ट्रेशन, बिलिंग, सब्सक्रिप्शन अप्रूवल और ग्लोबल प्लगइन कैटलॉग मैनेज होता है।
   - **डेटा प्लेन (Dedicated School Worker):** केवल **Director, Principal, Teacher, Staff, Student**। 
   - ⚠️ **सख्त नियम:** Dedicated School Worker में **SuperAdmin का कोई रोल नहीं होगा**। स्कूल का ऑपरेशनल डेटा पूरी तरह प्राइवेट रहेगा।
5. **Dedicated Direct Workers (प्रति-स्कूल routes):**
   - सभी स्कूलों को Cloudflare **plain dedicated Workers** के रूप में provision किया जाता है। हर worker का अपना `[[routes]]` (`<slug>.pragnya.nasven.com/*`) होता है, जो सीधे उसी school worker को serve करता है — कोई अलग routing layer नहीं।
   - हर school worker के अपने bindings (D1/R2/KV) और अपने secrets होते हैं — full tenant isolation, clean worker list और per-tenant usage tracking मिलती है।

---

## 2. ⚡ कोड बदलने से पहले का चेकलिस्ट (Pre-Change Checklist)

किसी भी AI एजेंट या डेवलपर को कोड बदलने से पहले यह 4 बातें जांचनी होंगी:
1. **क्या यह फ़ीचर सभी स्कूलों के लिए सामान्य है?** 
   - हाँ ➔ कोर (`api/`, `app/`, `components/`) में बदलाव करें।
   - नहीं, केवल कुछ स्कूलों या प्रीमियम स्कूलों के लिए है ➔ इसे **Plugin** या **Feature Flag** बनाएं।
2. **क्या D1 क्वेरी में `school_id` शामिल है?**
   - Shared DB की हर SELECT, UPDATE, DELETE क्वेरी में `WHERE school_id = ?` होना अनिवार्य है।
3. **क्या कोई बड़ी फाइल या मीडिया D1 में सेव हो रही है?**
   - नहीं! फोटो, असाइनमेंट PDF, मार्कशीट हमेशा **R2 (`MEDIA_BUCKET`)** में जाएंगी।
4. **क्या कैशिंग की आवश्यकता है?**
   - बार-बार पढ़े जाने वाले स्टैटिक कॉन्फ़िगरेशन को **KV (`CONFIG_KV`)** में कैश करें।

---

## 3. 🧩 प्लगइन आर्किटेक्चर गाइड (Plugin Architecture & Creation Guide)

### 📋 पहले पढ़ें: Student Extra Fields (Per-School Dynamic Custom Fields)

> School-विशिष्ट "Add Student" अतिरिक्त फ़ील्ड (जैसे किसी एक स्कूल के लिए bus route, caste
> certificate no., sports category आदि) के लिए **core `students` टेबल में column मत जोड़ें और न ही
> plugin बनाएं** — यह **config-driven dynamic custom fields** से होता है:
>
> - **दो D1 टेबल (migration `0038`):** `student_custom_field_defs` (प्रति-स्कूल field definitions,
>   `school_id` से scoped) और `student_custom_field_values` (प्रति-student values, `school_id` +
>   `student_id` से scoped)। दोनों टेबल की हर क्वेरी में `WHERE school_id = ?` अनिवार्य है।
> - **API (`api/students/index.ts`):**
>   - `GET /api/students/custom-fields` → उसी school के active fields (forms इससे render होते हैं)।
>   - `POST / PUT / DELETE /api/students/custom-fields[/:id]` → सिर्फ़ **Director/Principal** ही
>     fields define/edit/delete कर सकते हैं (server-side `isFieldManager` role gate)।
>   - `POST /api/students` व `PUT /api/students/:id` body में `customFields` map accept करते हैं
>     (delete+insert upsert); `GET /api/students/:id` response में `customFields` map merge मिलता है।
> - **Flutter:** `CustomFieldsEditor` widget (`widgets/custom_fields_editor.dart`) किसी भी form में
>   defs के अनुसार text/number/dropdown/date/checkbox fields dynamically render करता है — Add dialog
>   (`teacher_attendance_screen.dart`, `students_list_screen.dart`) और Edit form
>   (`student_detail_screen.dart`) दोनों में। Director/Principal के लिए
>   `custom_fields_manager_screen.dart` (Director dashboard में "अतिरिक्त फ़ील्ड")।
> - जिस स्कूल ने fields define नहीं कीं, उसके forms/API बिल्कुल पहले जैसे रहते हैं — कोई UI change नहीं।
> - `field_key` lowercase alphanumeric + underscore; `field_type` ∈ text/number/dropdown/date/checkbox;
>   dropdown `options` JSON array; `required`/`sort_order`/`is_active` flags।
### 🎗️ नया स्कूल Onboarding — Dedicated Resources (D1/R2/KV) aur Main-DB रिकॉर्ड

> हर स्कूल (plan चाहे कोई भी हो) को उसका **अपना अलग dedicated Cloudflare worker + D1 + R2 बकेट + KV namespace** मिलता है; कोई per-school fork/कोड-कॉपी नहीं। Flow:
>
> - **API** (`api/lib/provisioning.ts`) स्कूल बनते ही उसकी entry `schools.json` (repo) में commit करता है और main-DB `school_tenants` में `provisioning_status = 'pending'` सेट करता है।
> - **Deploy-time** (`scripts/provision-school.mjs`) D1 (`school-management-<slug>-db`), R2 (`school-management-<slug>-media`) और KV (`school-management-<slug>-config`) provision करता है (नाम-आधारित idempotent), और फिर **resource IDs को control-plane main DB में record करता है** (`POST /api/internal/provisioning/record` → `school_tenants.d1_database_id / r2_bucket_name / kv_namespace_id` + status `live`)।
> - **Config deploy-time पर main DB से बनता है** — `scripts/generate-school-configs.mjs` `GET /api/internal/provisioning/registry` से IDs लेकर `wrangler-<slug>.toml` generate करता है (endpoint unavailable होने पर `schools.json` fallback — non-fatal)।
> - **Internal endpoints** (`api/internal/index.ts`): `/api/internal/provisioning/record` (POST) व `/api/internal/provisioning/registry` (GET); दोनों `X-Internal-Secret` से protected (`getInternalSyncSecret` — `INTERNAL_SYNC_SECRET` या `AUTH_SECRET` से derived m2m token)।
> - **कोई रनटाइम binding नहीं बदलती** — नई school deploy पर ही dedicated बनती है; तब तक wildcard fallback उसे shared समझकर serve करता है। Migration `0025` के columns ही ये IDs रखते हैं (कोई नई migration आवश्यक नहीं)।

यदि कोई स्कूल कोई कस्टम फ़ीचर (जैसे LMS डैशबोर्ड, बस जीपीएस, बायोमेट्रिक अटेंडेंस, लाइब्रेरी आदि) मांगता है, तो उसे प्लगइन के रूप में बनाया जाएगा।

### ⚠️ स्वर्णिम नियम (Golden Rule):
> कोर शेल `components/school-crm-shell.tsx` को **कभी भी एडिट नहीं करना है!**
> प्लगइन्स पूरी तरह वर्डप्रेस (WordPress) की तरह डिकपल्ड (Decoupled) हैं और डायनेमिकली लोड होते हैं।

---

### 🛠️ नया प्लगइन बनाने के 5 चरण (Step-by-Step Plugin Creation):

#### चरण 1: डेटाबेस माइग्रेशन (Database Registration)
`db_migrations/` में एक नई माइग्रेशन फ़ाइल बनाएं (जैसे `0024_plugin_xyz.sql`):
```sql
-- प्लगइन को ग्लोबल कैटलॉग में रजिस्टर करें
INSERT OR IGNORE INTO plugins (id, name, description, category, price_inr, is_active)
VALUES (
  'plugin-xyz',
  'XYZ Advanced Service',
  'Description of the add-on feature',
  'academics',
  49900,
  1
);
```

#### चरण 2: बैकएंड API रूट्स (Backend Hono App)
1. `api/plugin-xyz/index.ts` बनाएं:
```typescript
import { Hono } from 'hono';

const pluginApp = new Hono<{ Bindings: Env; Variables: { user: any; schoolId: string } }>();

// सभी रूट्स स्वचालित रूप से स्कूल-स्कोप्ड होंगे
pluginApp.get('/status', async (c) => {
  const schoolId = c.get('schoolId');
  return c.json({ success: true, schoolId, message: 'Plugin XYZ active' });
});

export default pluginApp;
```
2. `api/index.ts` में रूट रजिस्टर करें:
```typescript
import pluginXyzApp from './plugin-xyz';
// ...
app.route('/api/plugin-xyz', pluginXyzApp);
```

#### चरण 3: फ्रंटेंड कम्पोनेंट्स (Frontend UI Screen & Widget)
`plugins/plugin-xyz/` फ़ोल्डर बनाएं:
1. **स्क्रीन कम्पोनेंट (`plugins/plugin-xyz/screen.tsx`):**
```tsx
'use client';
import React from 'react';

export function PluginXyzScreen() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">XYZ Service Dashboard</h1>
      <p className="text-gray-600">This is loaded dynamically!</p>
    </div>
  );
}
```
2. **(वैकल्पिक) फ्लोटिंग विजेट (`plugins/plugin-xyz/widget.tsx`):** अगर कोई फ्लोटिंग बटन या क्विक स्टेटस चाहिए।

#### चरण 4: प्लगइन रजिस्ट्री में जोड़ना (Frontend Registry)
`plugins/index.ts` खोलें और नए प्लगइन को `PLUGINS_REGISTRY` में जोड़ें:
```typescript
import { PluginXyzScreen } from './plugin-xyz/screen';
import { Sparkles } from 'lucide-react';

export const PLUGINS_REGISTRY: FrontendPlugin[] = [
  // ... बाकी प्लगइन्स
  {
    id: 'plugin-xyz', // यह ID डेटाबेस की id से 100% मैच होनी चाहिए
    navItems: [
      {
        id: 'plugin-xyz-tab',
        label: 'XYZ Service',
        icon: Sparkles,
        allowedRoles: ['Director', 'Principal', 'Teacher'],
        badge: 'Pro'
      }
    ],
    routes: [
      {
        id: 'plugin-xyz-tab',
        component: PluginXyzScreen
      }
    ]
  }
];
```

#### चरण 5: सक्रियण एवं उपयोग (Activation & Usage Flow)
- जब कोई स्कूल डायरेक्टर मार्केटप्लेस से प्लगइन एक्टिवेट/खरीदता है, तो `school_plugins` टेबल में एंट्री होती है।
- फ्रंटेंड शेल (`school-crm-shell.tsx`) लोड होते ही API से स्कूल के एक्टिव प्लगइन्स फ़ेच करता है।
- शेल स्वचालित रूप से `PLUGINS_REGISTRY` से मैच करके साइडबार में **NavItem** और स्क्रीन में **Route** इंजेक्ट कर देता है।

---

## 4. 🚀 डिप्लॉयमेंट एवं रजिस्ट्री (`schools.json`)

जब कोई नया स्कूल register/approve होता है (हर plan — Trial/Starter/Pro/Enterprise):
1. उसे `schools.json` में दर्ज किया जाता है:
```json
{
  "slug": "new-school",
  "schoolId": "school-tenant-uuid",
  "mode": "dedicated",
  "domain": "portal.newschool.edu.in",
  "emailQuota": 10000
}
```
2. `node scripts/provision-school.mjs` चलाकर उसका D1, R2, KV तैयार किया जाता है।
3. `node scripts/generate-school-configs.mjs` चलाकर उसके लिए अलग `wrangler-new-school.toml` बनता है।
4. CI/CD पाइपलाइन (`deploy.yml`) द्वारा कोड डिप्लॉय हो जाता है।

### ✅ प्रोडक्शन स्थिति (Production Status — live & verified)

> [!IMPORTANT]
> **Dedicated-by-default production migration COMPLETE (2026-09-24)।** सभी schools अपने-अपने
> dedicated worker पर **live** हैं और `<slug>.pragnya.nasven.com` सभी 200 return करते हैं:
> - `vidyasetu` → `vidyasetu.pragnya.nasven.com`
> - `a` (Maa karma) → `a.pragnya.nasven.com`
> - `yagya-pragnya` (yagya ashram) → `yagya-pragnya.pragnya.nasven.com`
> - Shared worker `pragnya.nasven.com` सिर्फ़ **control plane + wildcard fallback** के रूप में live है।
> - हर dedicated worker का अपना D1 (`school-management-<slug>-db`), R2 (`school-management-<slug>-media`),
>   KV (`school-management-<slug>-config`) और अपना `[[routes]]` provisioned है।

### ⚠️ Dedicated Deploy & Data-Copy के अनुभव-सिद्ध नियम (field-proven gotchas — इन्हें कभी मत तोड़ो)

1. **`wrangler@4 d1 execute --json` के SQL errors `stdout` पर JSON में आते हैं, stderr अक्सर खाली रहता है।**
   इसलिए `scripts/migrate-to-dedicated.mjs` की `runD1()` को failure पर **stderr + stdout दोनों** error message में
   शामिल करना ही चाहिए (अनिवार्य)। सिर्फ़ stderr लेने पर हर failure `Command failed with code 1` दिखेगा और
   schema-drift tolerance (`no such table|no such column`) कभी match नहीं होगा → **एक genuine schema mismatch गलत
   तरीके से पूरे deploy को abort कर देगा** (ऐसा होकर ही यह नियम बना है — fix `cd82dc2`)।
2. **`user_notification_tokens` school-scoped नहीं है** — migration `0010` में इसका कोई `school_id` column नहीं है
   (यह `user_id` से keyed है)। इसे **कभी भी** `OPERATIONAL_TABLES` (per-school copy list) में वापस मत जोड़ो —
   shared D1 पर `SELECT … WHERE school_id = …` हमेशा fail-loud abort करेगा।
3. **Migrations में कभी `BEGIN` / `COMMIT` मत लिखो** — `wrangler@4` remote D1 उन्हें code `7500` से reject करता है।
   हर migration transaction-free (सिर्फ़ idempotent DDL/DML) होनी चाहिए (fix `7e2f942`)।
4. **Data copy fail-loud + idempotent है:** कोई भी copy failure उस school का dedicated deploy abort करता है
   (school wildcard fallback पर चलता रहता है — कोई prod outage नहीं)। Re-deploy पर पहले से copy हुआ data दोबारा
   नहीं लिखा जाता (`dedicatedHasData` guard) — कभी भी इस guard को हटाकर "force copy" मत बनाओ।
5. **Plan बदलने पर कभी auto-deprovision नहीं होता** — school dedicated ही रहता है। Downgrade सिर्फ़ आपातकालीन,
   मैन्युअल (`scripts/downgrade-school.mjs`)।

---

## 5. 🛡️ सुरक्षा एवं ऑथेंटिकेशन नियम (Security & Auth Rules)

1. **Dedicated Worker पर School ID फिक्स रहेगा:**
   - Dedicated Worker पर `c.env.SCHOOL_ID` तय होता है।
   - यदि टोकन का `authUser.schoolId !== c.env.SCHOOL_ID` है, तो रिक्वेस्ट तुरंत 401/403 से रिजेक्ट होगी।
2. **`X-School-Id` हेडर का दायरा:**
   - `X-School-Id` हेडर का उपयोग केवल और केवल **SuperAdmin** ही मेन प्लेटफॉर्म वर्कर पर कर सकता है। सामान्य यूजर्स या डेडिकेटेड वर्कर्स पर यह हेडर स्वीकार्य नहीं होगा।
3. **Control Plane रूट्स की प्रॉक्सी (Proxy to Pragnya):**
   - Dedicated Worker पर आने वाली बिलिंग (`/api/billing/*`), सब्सक्रिप्शन, और ग्लोबल प्लगइन कैटलॉग की रिक्वेस्ट स्वचालित रूप से मुख्य वर्कर (`https://pragnya.nasven.com`) को प्रॉक्सी होंगी।

---

## 6. ⚡ डेटाबेस और परफॉरमेंस नियम (D1 & Storage Optimization)

1. **कंपोजिट इंडेक्स (Composite Indexes):**
   - शेयर्ड D1 की हर टेबल पर `(school_id, id)` या `(school_id, created_at)` जैसे कंपोजिट इंडेक्स होने चाहिए ताकि क्वेरी कभी स्लो न हो।
2. **बड़ी फाइल्स और मीडिया:**
   - फोटो, असाइनमेंट PDF, मार्कशीट D1 में कभी नहीं जाएंगी — हमेशा **R2 (`MEDIA_BUCKET`)** में अपलोड होंगी।
3. **KV कैशिंग:**
   - स्कूल प्रोफाइल और एक्टिव प्लगइन लिस्ट जैसे स्टैटिक डेटा को **KV (`CONFIG_KV`)** में कैश किया जाए।

---

## 7. 🧹 Git एवं बिल्ड नियम (Build & Git Hygiene)

1. **बिल्ड आर्टिफैक्ट्स Git में कभी कमिट न करें:**
   - `out/`, `.next/`, या `.wrangler/` को कभी भी Git में कमिट न करें।
2. **Idempotent माइग्रेशन्स:**
   - सभी SQL माइग्रेशन्स में `CREATE TABLE IF NOT EXISTS` और `INSERT OR IGNORE` का ही प्रयोग करें।

---

## 8. 🔄 Git, PR एवं CI/CD वर्कफ़्लो नियम (Mandatory PR & CI/CD Lifecycle)

> [!IMPORTANT]
> कोड में कोई भी बदलाव करते समय हर AI Agent और Developer के लिए यह 5-चरणीय वर्कफ़्लो अनिवार्य है:

### 1. ओपन PRs और Main Branch की पहले जाँच (Inspect Open PRs First):
- कोई भी काम शुरू करने से पहले `gh pr list` चलाकर सभी ओपन (Open) PRs की जाँच करें।
- संबंधित PR को `gh pr view <number>` से पढ़ें और समझें कि पहले से क्या काम चल रहा है ताकि डुप्लीकेशन या कॉन्फ्लिक्ट न हो।
- `main` ब्रांच के ताज़ा कोड को भी अच्छी तरह देखें।

### 2. नई ब्रांच का निर्माण (Dedicated Feature Branch):
- कभी भी `main` ब्रांच पर सीधा कमिट न करें।
- हमेशा एक नई वर्णनात्मक ब्रांच बनाएं:
  ```bash
  git checkout -b feature/<feature-name> # या fix/<issue-name>
  ```
- उसी ब्रांच पर सारे बदलाव करें और साफ़-सुथरे कमिट्स बनाएं।

### 3. पुल रिक्वेस्ट (PR) बनाना:
- बदलाव पूरे होने के बाद ब्रांच को रिमोट पर पुश करें और PR बनाएं:
  ```bash
  git push origin feature/<feature-name>
  gh pr create --title "..." --body "..."
  ```

### 4. GitHub Actions वर्कफ़्लो और 15 मिनट का इंतज़ार (Monitor Checks):
- PR बनते ही GitHub Actions वर्कफ़्लो ट्रिगर होगा।
- **15 मिनट तक का इंतज़ार करें** और वर्कफ़्लो के चलने पर नज़र रखें (उदा. `./check-pr.ps1` या `gh pr checks` चलाकर):
  - कौन-सा वर्कफ़्लो पास हुआ और कौन-सा फ़ेल हुआ, इसका बारीकी से विश्लेषण करें।

### 5. AI Agent रिव्यू एवं फ़िक्स चक्र (Review & Verification):
- यदि किसी AI Agent (जैसे Jules/Review Bot) ने PR पर रिव्यू दिया है, तो टिप्पणियों को ध्यान से पढ़ें।
- फ़ेल हुए स्टेप्स या AI सुझावों को वेरिफाई करें, उसी ब्रांच पर सुधार (Fix) करें, फिर से पुश करें और जब तक सारे चेक्स ग्रीन (Pass) न हो जाएं, तब तक आगे न बढ़ें।

---

## 9. 🎯 सारांश (Summary Rule for Every AI/Dev)
- **Core हल्का रखें:** Student, Teacher, Attendance, Fees कोर में हैं।
- **LMS और अन्य एडवांस्ड फीचर्स:** हमेशा प्लगइन के रूप में बनेंगे।
- **Never Break Single Codebase:** कोड एक ही रहेगा, हर स्कूल का अपना dedicated worker होगा (config `wrangler-<slug>.toml` से बदलेगा)।
- **SuperAdmin अलगाव:** Dedicated School Worker में SuperAdmin का कोई एक्सेस नहीं होगा।
- **PR & CI/CD चक्र का पालन:** हमेशा नई ब्रांच ➔ PR ➔ 15 मिनट वर्कफ़्लो मॉनिटर ➔ AI रिव्यू वेरिफाई करके ही आगे बढ़ें।
