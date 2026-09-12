import { Hono } from 'hono';
import {
  SUBSCRIPTION_PLANS,
  schoolSubscriptionStore,
  subscriptionAddonsStore,
  schoolCustomDomainStore,
  billingInvoicesStore,
  schoolTenants,
  currentSchoolId,
  setCurrentSchoolId,
  generateSchoolTopics,
  schoolFcmTopicsStore,
  BillingCycle,
  SubscriptionPlanId,
} from '../db';

const billingApp = new Hono();

// -----------------------------------------------------------------------------
// 1. Get Subscription Plans & Pricing Matrix
// -----------------------------------------------------------------------------
billingApp.get('/plans', (c) => {
  return c.json({
    success: true,
    plans: SUBSCRIPTION_PLANS,
    billingCycles: [
      { id: 'monthly', label: 'मासिक (Monthly)', discount: 0, tag: 'मानक बिलिंग' },
      { id: 'quarterly', label: 'त्रैमासिक (Quarterly)', discount: 5, tag: '5% बचत' },
      { id: 'annual', label: 'वार्षिक (Annual)', discount: 20, tag: '20% महाबचत (अनुशंसित)' },
    ],
    currency: 'INR (₹)',
  });
});

// -----------------------------------------------------------------------------
// 2. Get Current School's Active Subscription
// -----------------------------------------------------------------------------
billingApp.get('/subscription', (c) => {
  const currentSchool = schoolTenants.find((s) => s.id === currentSchoolId) || schoolTenants[0];
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === schoolSubscriptionStore.planId) || SUBSCRIPTION_PLANS[2];

  return c.json({
    success: true,
    school: currentSchool,
    subscription: schoolSubscriptionStore,
    planDetails: plan,
    autoPayStatus: {
      enabled: schoolSubscriptionStore.autoPayEnabled,
      mandateId: schoolSubscriptionStore.mandateId,
      mandateBank: schoolSubscriptionStore.mandateBank,
      paymentMethod: schoolSubscriptionStore.paymentMethod,
      nextBillingDate: schoolSubscriptionStore.nextBillingDate,
      amountDue: schoolSubscriptionStore.pricePerCycle,
    },
  });
});

// -----------------------------------------------------------------------------
// 3. Upgrade or Downgrade Subscription Plan
// -----------------------------------------------------------------------------
billingApp.post('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { planId, billingCycle, autoPayEnabled, paymentMethod } = body as {
    planId: SubscriptionPlanId;
    billingCycle: BillingCycle;
    autoPayEnabled?: boolean;
    paymentMethod?: string;
  };

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
  if (!selectedPlan) {
    return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);
  }

  const cycle: BillingCycle = billingCycle || 'annual';
  let price = selectedPlan.monthlyPrice;
  let discount = 0;

  if (cycle === 'quarterly') {
    price = selectedPlan.quarterlyPrice;
    discount = 5;
  } else if (cycle === 'annual') {
    price = selectedPlan.annualPrice;
    discount = 20;
  }

  const prevPlan = schoolSubscriptionStore.planName;
  const isUpgrade =
    (planId === 'enterprise' && schoolSubscriptionStore.planId !== 'enterprise') ||
    (planId === 'pro' && schoolSubscriptionStore.planId === 'starter');

  schoolSubscriptionStore.planId = planId;
  schoolSubscriptionStore.planName = selectedPlan.name;
  schoolSubscriptionStore.billingCycle = cycle;
  schoolSubscriptionStore.pricePerCycle = price;
  schoolSubscriptionStore.discountPercent = discount;
  if (typeof autoPayEnabled === 'boolean') {
    schoolSubscriptionStore.autoPayEnabled = autoPayEnabled;
  }
  if (paymentMethod) {
    schoolSubscriptionStore.paymentMethod = paymentMethod as any;
  }
  schoolSubscriptionStore.updatedAt = new Date().toISOString();

  // Create Tax Invoice for the change
  const invoiceId = `VS-INV-${Date.now().toString().slice(-6)}`;
  const gst = +(price * 0.18).toFixed(2);
  const total = +(price + gst).toFixed(2);

  const newInvoice = {
    id: `binv-${Date.now()}`,
    schoolId: currentSchoolId,
    invoiceNumber: invoiceId,
    description: `${selectedPlan.name} (${cycle === 'annual' ? 'वार्षिक' : cycle === 'quarterly' ? 'त्रैमासिक' : 'मासिक'} सदस्यता नवीनीकरण)`,
    planName: selectedPlan.name,
    billingCycle: cycle === 'annual' ? 'वार्षिक (20% छूट)' : cycle === 'quarterly' ? 'त्रैमासिक (5% छूट)' : 'मासिक',
    subtotal: price,
    gstPercent: 18,
    gstAmount: gst,
    totalAmount: total,
    paymentStatus: 'Paid' as const,
    paymentMethod: schoolSubscriptionStore.autoPayEnabled ? `${schoolSubscriptionStore.paymentMethod} (स्वतः भुगतान)` : 'ऑनलाइन नेटबैंकिंग',
    transactionId: `TXN-${Date.now()}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    paidAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };

  billingInvoicesStore.unshift(newInvoice);

  return c.json({
    success: true,
    message: isUpgrade
      ? `बधाई हो! आपका स्कूल सफलतापूर्वक ${selectedPlan.name} में अपग्रेड कर दिया गया है।`
      : `प्लान सफलतापूर्वक अपडेट कर दिया गया है। नया प्लान: ${selectedPlan.name}।`,
    previousPlan: prevPlan,
    currentSubscription: schoolSubscriptionStore,
    invoice: newInvoice,
  });
});

// -----------------------------------------------------------------------------
// 4. Toggle Auto-Pay Mandate Status
// -----------------------------------------------------------------------------
billingApp.post('/autopay/toggle', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { enable, paymentMethod, bankName } = body;

  const willEnable = typeof enable === 'boolean' ? enable : !schoolSubscriptionStore.autoPayEnabled;
  schoolSubscriptionStore.autoPayEnabled = willEnable;

  if (willEnable) {
    if (paymentMethod) schoolSubscriptionStore.paymentMethod = paymentMethod;
    if (bankName) schoolSubscriptionStore.mandateBank = bankName;
    schoolSubscriptionStore.mandateId = `MNDT-AUTO-${Date.now().toString().slice(-8)}`;
  }

  schoolSubscriptionStore.updatedAt = new Date().toISOString();

  return c.json({
    success: true,
    message: willEnable
      ? 'ऑटो-पे (Auto-Pay) मैंडेट सफलतापूर्वक सक्रिय कर दिया गया है। अगली देय तिथि पर शुल्क स्वतः कटेगा।'
      : 'ऑटो-पे निष्क्रिय कर दिया गया है। अब आपको देय तिथि पर मैन्युअल भुगतान करना होगा।',
    autoPayStatus: {
      enabled: schoolSubscriptionStore.autoPayEnabled,
      mandateId: schoolSubscriptionStore.mandateId,
      mandateBank: schoolSubscriptionStore.mandateBank,
      paymentMethod: schoolSubscriptionStore.paymentMethod,
      nextBillingDate: schoolSubscriptionStore.nextBillingDate,
    },
  });
});

// -----------------------------------------------------------------------------
// 5. Add-ons: Dual Email (Normal Gmail vs Official Custom Domain) & Others
// -----------------------------------------------------------------------------
billingApp.get('/addons', (c) => {
  return c.json({
    success: true,
    emailServices: {
      standardEmail: {
        type: 'standard_gmail_system',
        name: 'सामान्य जीमेल / सिस्टम ईमेल सेवा (Standard Email)',
        costText: 'सभी प्लान्स में शामिल (निःशुल्क)',
        price: 0,
        senderDomain: 'notifications@vidyasetuschool-system.com / Linked Gmail',
        features: ['दैनिक उपस्थिति अलर्ट', 'सामान्य नोटिस प्रेषण', 'शून्य अतिरिक्त शुल्क'],
        status: 'Active',
      },
      domainEmail: {
        type: 'custom_domain_email',
        name: 'कस्टम डोमेन ऑफिशियल ईमेल सेवा (Official Domain Email - Add-on)',
        costText: '₹499/माह (प्रति 10,000 ऑफिशियल ईमेल)',
        price: 499,
        senderDomain: `@${schoolCustomDomainStore.domainName}`,
        features: [
          'सीबीएसई व बोर्ड पत्राचार हेतु स्कूल के आधिकारिक डोमेन से ईमेल',
          'Cloudflare Email Routing + SPF/DKIM/DMARC 100% इनबॉक्स डिलीवरी',
          'समर्पित मेलबॉक्स (@principal, @accounts, @director)',
          'अनुकूलित स्कूल हेडर, सील एवं डिजिटल हस्ताक्षर',
        ],
        status: schoolCustomDomainStore.isActive ? 'Active' : 'Not_Configured',
        quota: {
          monthlyLimit: schoolCustomDomainStore.monthlySendingQuota,
          sentThisMonth: schoolCustomDomainStore.monthlySentCount,
          remaining: schoolCustomDomainStore.monthlySendingQuota - schoolCustomDomainStore.monthlySentCount,
        },
      },
    },
    activeAddons: subscriptionAddonsStore,
  });
});

// Purchase Add-on (e.g. Extra Custom Domain Emails or Storage)
billingApp.post('/addons/purchase', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { addonType, quantity = 1 } = body;

  if (addonType === 'custom_domain_email') {
    const unitPrice = 499;
    const existing = subscriptionAddonsStore.find((a) => a.addonType === 'custom_domain_email');
    if (existing) {
      existing.quantity += quantity;
      existing.addonName = `कस्टम डोमेन ऑफिशियल ईमेल पैक (${existing.quantity * 10000} मेल्स/माह)`;
    } else {
      subscriptionAddonsStore.push({
        id: `addon-${Date.now()}`,
        schoolId: currentSchoolId,
        addonType: 'custom_domain_email',
        addonName: `कस्टम डोमेन ऑफिशियल ईमेल पैक (${quantity * 10000} मेल्स/माह)`,
        quantity,
        unitPrice,
        billingCycle: 'monthly',
        status: 'Active',
        createdAt: new Date().toISOString().split('T')[0],
      });
    }

    schoolCustomDomainStore.monthlySendingQuota += quantity * 10000;

    return c.json({
      success: true,
      message: `सफलतापूर्वक ${quantity * 10000} अतिरिक्त कस्टम डोमेन ऑफिशियल ईमेल कोटा जोड़ दिया गया।`,
      quota: {
        monthlyLimit: schoolCustomDomainStore.monthlySendingQuota,
        sentCount: schoolCustomDomainStore.monthlySentCount,
      },
    });
  }

  return c.json({ success: false, message: 'अमान्य ऐड-ऑन प्रकार।' }, 400);
});

// -----------------------------------------------------------------------------
// 6. Custom School Domain Configuration & DNS Status Check
// -----------------------------------------------------------------------------
billingApp.get('/domain', (c) => {
  return c.json({
    success: true,
    domain: schoolCustomDomainStore,
    dnsVerificationRecords: [
      {
        type: 'TXT (SPF)',
        host: '@',
        value: 'v=spf1 include:_spf.cloudflare.net ~all',
        status: schoolCustomDomainStore.spfRecordStatus,
        requiredFor: 'ईमेल स्पैम रोकथाम एवं प्रेषक सत्यापन',
      },
      {
        type: 'CNAME (DKIM)',
        host: 'cf2026._domainkey',
        value: 'cf2026._domainkey.vidyasetu-school.cloudflare.net',
        status: schoolCustomDomainStore.dkimRecordStatus,
        requiredFor: 'डिजिटल हस्ताक्षर एवं टेंपर-प्रूफ प्रेषण',
      },
      {
        type: 'MX (Mail Routing)',
        host: '@',
        value: 'isaac.mx.cloudflare.net (Priority 10)',
        status: schoolCustomDomainStore.mxRecordStatus,
        requiredFor: 'आधिकारिक इनबाउंड व आउटबाउंड ईमेल रूटिंग',
      },
      {
        type: 'TXT (DMARC)',
        host: '_dmarc',
        value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@vidyasetuschool.edu.in',
        status: schoolCustomDomainStore.dmarcRecordStatus,
        requiredFor: 'डोमेन स्पूफिंग सुरक्षा व बोर्ड अनुपालन',
      },
    ],
  });
});

// Configure or Verify Custom Domain
billingApp.post('/domain/configure', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { domainName } = body;

  if (domainName) {
    schoolCustomDomainStore.domainName = domainName.trim().toLowerCase();
  }

  // Simulate Cloudflare DNS verification
  schoolCustomDomainStore.spfRecordStatus = 'Verified';
  schoolCustomDomainStore.dkimRecordStatus = 'Verified';
  schoolCustomDomainStore.mxRecordStatus = 'Verified';
  schoolCustomDomainStore.dmarcRecordStatus = 'Verified';
  schoolCustomDomainStore.isActive = true;

  return c.json({
    success: true,
    message: `डोमेन @${schoolCustomDomainStore.domainName} के सभी Cloudflare DNS रिकॉर्ड्स (SPF, DKIM, DMARC) सफलतापूर्वक सत्यापित (Verified) हो गए हैं। अब आप ऑफिशियल ईमेल भेजने के लिए तैयार हैं।`,
    domain: schoolCustomDomainStore,
  });
});

// Add Mailbox to Custom Domain
billingApp.post('/domain/add-mailbox', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { prefix } = body;

  if (!prefix) {
    return c.json({ success: false, message: 'ईमेल प्रिफिक्स आवश्यक है (उदा. principal, accounts)' }, 400);
  }

  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  const fullEmail = `${cleanPrefix}@${schoolCustomDomainStore.domainName}`;

  if (schoolCustomDomainStore.configuredMailboxes.includes(fullEmail)) {
    return c.json({ success: false, message: 'यह ईमेल पहले से ही पंजीकृत है।' }, 400);
  }

  schoolCustomDomainStore.configuredMailboxes.push(fullEmail);

  return c.json({
    success: true,
    message: `नया आधिकारिक मेलबॉक्स ${fullEmail} सफलतापूर्वक सक्रिय किया गया।`,
    mailboxes: schoolCustomDomainStore.configuredMailboxes,
  });
});

// -----------------------------------------------------------------------------
// 7. Get Tax Invoices & Auto-Pay Receipts
// -----------------------------------------------------------------------------
billingApp.get('/invoices', (c) => {
  return c.json({
    success: true,
    invoices: billingInvoicesStore,
  });
});

// -----------------------------------------------------------------------------
// 8. Multi-Tenancy Management (Switch Schools & Tenant Isolation)
// -----------------------------------------------------------------------------
billingApp.get('/schools', (c) => {
  return c.json({
    success: true,
    currentSchoolId,
    schools: schoolTenants,
  });
});

billingApp.post('/schools/switch', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { schoolId } = body;

  const found = schoolTenants.find((s) => s.id === schoolId);
  if (!found) {
    return c.json({ success: false, message: 'स्कूल आईडी नहीं मिली।' }, 404);
  }

  setCurrentSchoolId(schoolId);
  return c.json({
    success: true,
    message: `सफलतापूर्वक विद्यालय बदला गया: ${found.schoolName}`,
    currentSchoolId: found.id,
    currentSchool: found,
  });
});

export default billingApp;
