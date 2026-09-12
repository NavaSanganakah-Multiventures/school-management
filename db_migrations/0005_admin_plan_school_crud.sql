-- Migration: 0005_admin_plan_school_crud.sql
-- Description: Super Admin school CRUD (add/edit/soft-delete) and dynamic subscription
-- plans (create/edit/deactivate). Also removes the hard-coded plan_id CHECK so custom
-- plans can be assigned to schools.

-- 1. Soft-delete marker for schools (safe delete/restore without losing data)
ALTER TABLE school_tenants ADD COLUMN deleted_at TEXT;

-- 2. Rebuild school_subscriptions without the restrictive plan_id CHECK
CREATE TABLE school_subscriptions_new (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'quarterly', 'annual')),
    price_per_cycle REAL NOT NULL,
    discount_percent REAL DEFAULT 0,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Past_Due', 'Canceled', 'Trial')),
    auto_pay_enabled INTEGER DEFAULT 1,
    payment_method TEXT DEFAULT 'UPI AutoPay',
    mandate_id TEXT,
    next_billing_date TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trial_ends_at TEXT,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

INSERT INTO school_subscriptions_new
    (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status,
     auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end,
     updated_at, trial_ends_at, razorpay_order_id, razorpay_payment_id, razorpay_signature)
SELECT
    id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status,
    auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end,
    updated_at, trial_ends_at, razorpay_order_id, razorpay_payment_id, razorpay_signature
FROM school_subscriptions;

DROP TABLE school_subscriptions;
ALTER TABLE school_subscriptions_new RENAME TO school_subscriptions;

-- 3. Dynamic subscription plans master table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT DEFAULT '',
    badge TEXT DEFAULT '',
    monthly_price REAL NOT NULL DEFAULT 0,
    quarterly_price REAL NOT NULL DEFAULT 0,
    annual_price REAL NOT NULL DEFAULT 0,
    max_students INTEGER,
    max_staff INTEGER,
    max_students_label TEXT DEFAULT '',
    modules TEXT NOT NULL DEFAULT '[]',
    features TEXT NOT NULL DEFAULT '[]',
    feature_flags TEXT NOT NULL DEFAULT '{}',
    recommended INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    is_trial INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

-- 4. Seed the existing four plans (keeps behavior identical to the previous static definitions)
INSERT INTO subscription_plans
    (id, name, tagline, badge, monthly_price, quarterly_price, annual_price,
     max_students, max_staff, max_students_label, modules, features, feature_flags,
     recommended, active, is_trial, sort_order, created_at, updated_at)
VALUES
    ('trial', '7-दिन फ्री ट्रायल', 'नए स्कूल पंजीकरण हेतु निःशुल्क परीक्षण (Super Admin अप्रूवल के बाद 7 दिन)', 'फ्री', 0, 0, 0,
     50, 10, '50 विद्यार्थी',
     '["dashboard","students","attendance","staff","notices","fees","settings","billing"]',
     '["डैशबोर्ड व स्कूल प्रोफ़ाइल सेटअप","स्कॉलर रजिस्टर (अधिकतम 50 छात्र)","दैनिक छात्र उपस्थिति","स्टाफ निर्देशिका (अधिकतम 10 सदस्य)","नोटिस पट्ट व सूचना","बुनियादी फीस चालान"]',
     '{"reportCards":false,"principalHistory":false,"autopay":false,"domainEmail":false,"multiSchool":false,"prioritySupport":false,"customDomainIncluded":false}',
     0, 1, 1, 0, datetime('now'), datetime('now')),
    ('starter', 'स्टार्टर प्लान (Starter)', 'प्राथमिक विद्यालयों (500 छात्रों तक) के लिए उपयुक्त', NULL, 2499, 7122, 23988,
     500, 25, '500 विद्यार्थी',
     '["dashboard","students","attendance","staff","notices","fees","exams","settings","billing"]',
     '["डिजिटल स्कॉलर रजिस्टर (दाखिला-खारिज)","दैनिक छात्र उपस्थिति","निदेशक, प्रधानाचार्य व शिक्षक 3-रोल व्यवस्था","फीस रसीद व चालान निर्माण","सामान्य ईमेल सूचना सेवा","परीक्षा व अंक प्रविष्टि (बेसिक)"]',
     '{"reportCards":false,"principalHistory":false,"autopay":false,"domainEmail":false,"multiSchool":false,"prioritySupport":false,"customDomainIncluded":false}',
     0, 1, 0, 1, datetime('now'), datetime('now')),
    ('pro', 'प्रोफेशनल प्लान (Professional)', 'सीनियर सेकेंडरी व तेजी से बढ़ते विद्यालयों (1500 छात्रों तक) के लिए', 'सर्वाधिक लोकप्रिय', 5999, 17097, 57588,
     1500, 100, '1500 विद्यार्थी',
     '["dashboard","students","attendance","staff","notices","fees","exams","principal","settings","billing"]',
     '["स्टार्टर की सभी सुविधाएं","विस्तृत रिपोर्ट कार्ड व परीक्षा परिणाम","प्रधानाचार्य नियुक्ति एवं इतिहास","ऑटो-पे रिकरिंग बिलिंग (UPI/e-NACH)","कस्टम डोमेन ईमेल ऐड-ऑन","प्राथमिकता तकनीकी सहायता"]',
     '{"reportCards":true,"principalHistory":true,"autopay":true,"domainEmail":true,"multiSchool":false,"prioritySupport":true,"customDomainIncluded":false}',
     1, 1, 0, 2, datetime('now'), datetime('now')),
    ('enterprise', 'एंटरप्राइज प्लान (Enterprise)', 'बड़े संस्थानों, ट्रस्ट व बहु-शाखा ग्रुप ऑफ स्कूल्स के लिए', 'असीमित क्षमता', 11999, 34197, 115188,
     NULL, NULL, 'असीमित विद्यार्थी',
     '["dashboard","students","attendance","staff","notices","fees","exams","principal","settings","billing"]',
     '["प्रो की सभी सुविधाएं","कस्टम डोमेन ऑफिशियल ईमेल (शामिल)","मल्टी-स्कूल टेनेन्सी मैनेजमेंट","GST इनवॉइसिंग व ऑडिट रिपोर्ट्स","डेडिकेटेड अकाउंट मैनेजर","99.9% अपटाइम SLA"]',
     '{"reportCards":true,"principalHistory":true,"autopay":true,"domainEmail":true,"multiSchool":true,"prioritySupport":true,"customDomainIncluded":true}',
     0, 1, 0, 3, datetime('now'), datetime('now'));
