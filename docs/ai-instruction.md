# 🤖 AI Agent & Developer Guidelines (Pragnya Mitra School Management)
## 📌 फ़ाइल: `docs/ai-instruction.md` (एवं `.agents/rules/ai-instructions.md`)

> [!CAUTION]
> **सर्वोपरि और अनिवार्य नियम (Non-Negotiable Directive):**
> 1. **आर्किटेक्चर दस्तावेज़ पढ़ना अनिवार्य:** कोड में कोई भी बदलाव करने, समस्या देखने, या काम शुरू करने से पहले AI Agent को `docs/multitenant-deploy.md` और इस नियम फ़ाइल (`docs/ai-instruction.md` / `.agents/rules/ai-instructions.md`) को शुरू से अंत तक पढ़ना और समझना अनिवार्य है।
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
