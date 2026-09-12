// Production-Ready Master State & Schema for VidyaSetu School Management CRM
// Roles: Director (Super Admin), Principal (Academic Head), Staff (Teachers)
// Real Data Store for Scholar Register (दाखिला-खारिज रजिस्टर), Attendance, Fees, Exams, Notices

export type UserRole = 'Director' | 'Principal' | 'Staff';

export interface SchoolProfile {
  id: string;
  schoolName: string;
  affiliationNumber: string;
  boardName: string;
  schoolCode: string;
  email: string;
  phone: string;
  alternatePhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  academicSession: string;
  directorName: string;
  principalName: string;
  logoUrl?: string;
  updatedAt: string;
}

export interface SystemUser {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  designation: string;
  department: string;
  qualification: string;
  salary: number;
  status: 'Active' | 'Inactive';
  lastLogin?: string;
  createdAt: string;
}

export interface PrincipalHistoryRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  qualification: string;
  appointedDate: string;
  relievedDate?: string;
  status: 'Active' | 'Past';
  appointedBy: string;
  remarks?: string;
}

export interface StudentScholar {
  id: string;
  scholarNumber: string; // स्कॉलर क्रमांक (e.g. "SR-2026/001")
  rollNumber: string;    // रोल नंबर
  fullName: string;      // विद्यार्थी का नाम
  fatherName: string;    // पिता का नाम
  fatherOccupation: string; // पिता का व्यवसाय
  motherName: string;    // माता का नाम
  className: string;     // कक्षा (Class 1 to 12)
  section: string;       // वर्ग (A, B, C, Science, Commerce)
  dob: string;           // जन्म तिथि (YYYY-MM-DD)
  gender: 'Male' | 'Female' | 'Other';
  category: 'General' | 'OBC' | 'SC' | 'ST' | 'EWS';
  religion: string;      // धर्म
  aadhaarNumber: string; // आधार कार्ड संख्या (12 अंक)
  samagraId: string;     // समग्र आईडी / परिवार आईडी
  bloodGroup: string;    // रक्त समूह
  parentPhone: string;   // अभिभावक का मोबाइल नंबर
  whatsappNumber: string;// व्हाट्सएप नंबर
  email: string;         // ईमेल
  currentAddress: string;// वर्तमान पता
  permanentAddress: string;// स्थायी पता
  previousSchool: string;// पूर्व विद्यालय
  previousTcNo: string;  // पूर्व टीसी क्रमांक
  admissionDate: string; // प्रवेश दिनांक
  bankAccountNo: string; // बैंक खाता संख्या
  bankName: string;      // बैंक का नाम
  ifscCode: string;      // IFSC कोड
  status: 'Active' | 'TC_Issued' | 'Suspended' | 'Passed_Out';
  tcIssueDate?: string;
  remarks?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  scholarNumber: string;
  className: string;
  section: string;
  date: string;
  status: 'Present' | 'Absent' | 'Late' | 'Leave';
  remarks?: string;
  markedBy: string;
}

export interface FeeInvoice {
  id: string;
  invoiceNumber: string;
  studentId: string;
  studentName: string;
  scholarNumber: string;
  className: string;
  section: string;
  title: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  status: 'Paid' | 'Partial' | 'Unpaid' | 'Overdue';
  paymentMethod?: string;
  transactionId?: string;
  paidAt?: string;
}

export interface ExamRecord {
  id: string;
  examName: string;
  studentId: string;
  scholarNumber: string;
  studentName: string;
  className: string;
  subject: string;
  marksObtained: number;
  maxMarks: number;
  grade: string;
  remarks?: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: 'General' | 'Academic' | 'Holiday' | 'Exam' | 'Sports' | 'Emergency';
  targetAudience: 'All' | 'Students' | 'Teachers' | 'Parents';
  publishedBy: string;
  publishedDate: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  alertSent: boolean;
  fcmSent?: boolean;
}

export interface TeacherStaff {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  subject: string;
  phone: string;
  email: string;
  qualification: string;
  salary: number;
  status: 'Active' | 'Inactive';
  joiningDate: string;
}

// -----------------------------------------------------------------------------
// School Profile Master
// -----------------------------------------------------------------------------
export const schoolProfile: SchoolProfile = {
  id: 'school-01',
  schoolName: 'विद्या सेतु पब्लिक सीनियर सेकेंडरी स्कूल',
  affiliationNumber: 'CBSE/AFF/2026/89412',
  boardName: 'केंद्रीय माध्यमिक शिक्षा बोर्ड (CBSE)',
  schoolCode: 'SCH-DEL-4019',
  email: 'info@vidyasetuschool.edu.in',
  phone: '+91 11 2789 4500',
  alternatePhone: '+91 98100 12345',
  address: 'संस्थानिक क्षेत्र, फेज-2, रोहिणी',
  city: 'नई दिल्ली',
  state: 'दिल्ली',
  pincode: '110085',
  academicSession: '2026-2027',
  directorName: 'सत्यप्रकाश शर्मा',
  principalName: 'डॉ. आनंद मोहन त्रिवेदी',
  updatedAt: '2026-09-10',
};

// -----------------------------------------------------------------------------
// System Users (Director, Principal, Staff with Email/Password Auth)
// -----------------------------------------------------------------------------
export const systemUsers: SystemUser[] = [
  {
    id: 'usr-director',
    username: 'director',
    password: 'director123',
    fullName: 'सत्यप्रकाश शर्मा',
    email: 'director@vidyasetuschool.edu.in',
    phone: '+91 98100 12345',
    role: 'Director',
    designation: 'स्कूल निदेशक व प्रबंध न्यासी (Director & Managing Trustee)',
    department: 'प्रबंधन एवं प्रशासन (Management)',
    qualification: 'M.Sc., M.Ed., Ph.D. (Education Admin)',
    salary: 0,
    status: 'Active',
    createdAt: '2020-04-01',
  },
  {
    id: 'usr-principal',
    username: 'principal',
    password: 'principal123',
    fullName: 'डॉ. आनंद मोहन त्रिवेदी',
    email: 'principal@vidyasetuschool.edu.in',
    phone: '+91 98222 34567',
    role: 'Principal',
    designation: 'प्रधानाचार्य (Principal & Head of School)',
    department: 'शैक्षणिक एवं विद्यालय प्रशासन (Academics)',
    qualification: 'M.A. (English), M.Ed., Ph.D.',
    salary: 125000,
    status: 'Active',
    createdAt: '2022-06-01',
  },
  {
    id: 'usr-staff',
    username: 'staff',
    password: 'staff123',
    fullName: 'श्रीमती रेखा वर्मा',
    email: 'staff@vidyasetuschool.edu.in',
    phone: '+91 94123 45678',
    role: 'Staff',
    designation: 'वरिष्ठ शिक्षिका (PGT Mathematics & Class Teacher)',
    department: 'गणित संकाय (Mathematics)',
    qualification: 'M.Sc. (Maths), B.Ed.',
    salary: 68000,
    status: 'Active',
    createdAt: '2023-07-15',
  },
];

// Principal History (Maintained so Director can view & change Principals cleanly)
export const principalHistory: PrincipalHistoryRecord[] = [
  {
    id: 'prn-hist-01',
    fullName: 'डॉ. आनंद मोहन त्रिवेदी',
    email: 'principal@vidyasetuschool.edu.in',
    phone: '+91 98222 34567',
    qualification: 'M.A. (English), M.Ed., Ph.D.',
    appointedDate: '2022-06-01',
    status: 'Active',
    appointedBy: 'सत्यप्रकाश शर्मा (निदेशक)',
    remarks: 'वर्तमान कार्यरत प्रधानाचार्य',
  },
];

// Student Scholars List (स्कॉलर रजिस्टर दाखिला-खारिज) - Clean Database
export const studentScholars: StudentScholar[] = [];
export const initialStudents = studentScholars;

// Staff & Teachers Directory - Clean Database
export const staffMembers: TeacherStaff[] = [];

// Fee Invoices List - Clean Database
export const feeInvoices: FeeInvoice[] = [];

// School Notices List - Clean Database
export const schoolNotices: Notice[] = [];
export const noticesStore: Notice[] = schoolNotices;
export const initialNotices = noticesStore;

// Attendance Store (आज की दैनिक उपस्थिति) - Clean Database
export const attendanceStore: AttendanceRecord[] = [];

// Exam Records - Clean Database
export const examRecords: ExamRecord[] = [];

// Clean Notification History
export const notificationHistory: Array<{
  id: string;
  schoolId?: string;
  messageId: string;
  title: string;
  body: string;
  targetTopic: string;
  recipientToken?: string;
  deliveryStatus: string;
  sentAt: string;
}> = [];

// -----------------------------------------------------------------------------
// Multi-Tenancy & School Tenants
// -----------------------------------------------------------------------------
export interface SchoolTenant {
  id: string;
  schoolName: string;
  subdomain: string;
  customDomain?: string;
  contactEmail: string;
  contactPhone: string;
  status: 'Active' | 'Suspended' | 'Trial';
  createdAt: string;
}

export const schoolTenants: SchoolTenant[] = [
  {
    id: 'school-01',
    schoolName: 'विद्या सेतु पब्लिक सीनियर सेकेंडरी स्कूल',
    subdomain: 'vidyasetu',
    customDomain: 'vidyasetuschool.edu.in',
    contactEmail: 'director@vidyasetuschool.edu.in',
    contactPhone: '+91 98100 12345',
    status: 'Active',
    createdAt: '2024-04-01',
  },
  {
    id: 'school-02',
    schoolName: 'सरस्वती ज्ञान मंदिर इंटर कॉलेज',
    subdomain: 'sgm-college',
    customDomain: '',
    contactEmail: 'admin@sgmcollege.org',
    contactPhone: '+91 98765 43210',
    status: 'Active',
    createdAt: '2025-06-15',
  },
];

// Current active school in session context
export let currentSchoolId = 'school-01';
export const setCurrentSchoolId = (id: string) => {
  currentSchoolId = id;
};

// -----------------------------------------------------------------------------
// Enterprise Subscription & Auto-Pay Models
// -----------------------------------------------------------------------------
export type SubscriptionPlanId = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'quarterly' | 'annual';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface SubscriptionPlanDefinition {
  id: SubscriptionPlanId;
  name: string;
  tagline: string;
  badge?: string;
  monthlyPrice: number;
  quarterlyPrice: number; // 5% discount
  annualPrice: number;    // 20% discount
  maxStudents: string;
  features: string[];
  recommended?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanDefinition[] = [
  {
    id: 'starter',
    name: 'बेसिक / स्टार्टर प्लान (Starter)',
    tagline: 'प्राथमिक एवं माध्यमिक विद्यालयों (500 छात्रों तक) के लिए उपयुक्त',
    monthlyPrice: 2499,
    quarterlyPrice: 7122,  // 2374/mo (5% off)
    annualPrice: 23988,    // 1999/mo (20% off)
    maxStudents: '500 विद्यार्थी',
    features: [
      'डिजिटल स्कॉलर रजिस्टर (दाखिला-खारिज)',
      'दैनिक छात्र उपस्थिति एवं त्वरित रोल कॉल',
      'निदेशक, प्रधानाचार्य एवं शिक्षक 3-रोल व्यवस्था',
      'नॉर्मल जीमेल / सिस्टम ईमेल सूचना सेवा (शामिल)',
      'स्कूल-विशिष्ट पृथक FCM टॉपिक्स (डेटा अलगाव)',
      'बुनियादी फीस रसीद व चालान निर्माण',
    ],
  },
  {
    id: 'pro',
    name: 'प्रोफेशनल प्लान (Professional)',
    tagline: 'सीनियर सेकेंडरी व तेजी से बढ़ते विद्यालयों (1500 छात्रों तक) के लिए सर्वश्रेष्ठ',
    badge: 'सर्वाधिक लोकप्रिय',
    recommended: true,
    monthlyPrice: 5999,
    quarterlyPrice: 17097, // 5699/mo (5% off)
    annualPrice: 57588,    // 4799/mo (20% off)
    maxStudents: '1500 विद्यार्थी',
    features: [
      'स्टार्टर की सभी सुविधाएं',
      'प्रधानाचार्य नियुक्ति एवं स्थानांतरण इतिहास',
      'विस्तृत परीक्षा अंक प्रविष्टि व रिपोर्ट कार्ड',
      'ऑटो-पे रिकरिंग बिलिंग (UPI AutoPay / e-NACH)',
      'कस्टम डोमेन ईमेल ऐड-ऑन सपोर्ट (@school.edu.in)',
      'प्राथमिकता तकनीकी सहायता एवं साप्ताहिक बैकअप',
    ],
  },
  {
    id: 'enterprise',
    name: 'एंटरप्राइज प्लान (Enterprise)',
    tagline: 'बड़े शिक्षण संस्थानों, ट्रस्ट एवं बहु-शाखा (Multi-Branch) ग्रुप ऑफ स्कूल्स के लिए',
    badge: 'असीमित क्षमता',
    monthlyPrice: 11999,
    quarterlyPrice: 34197, // 11399/mo (5% off)
    annualPrice: 115188,   // 9599/mo (20% off)
    maxStudents: 'असीमित विद्यार्थी',
    features: [
      'सभी सुविधाएं बिना किसी प्रतिबंध के',
      'कस्टम डोमेन ऑफिशियल ईमेल (DKIM/SPF/DMARC सम्मिलित)',
      'मल्टी-स्कूल टेनेंसी मैनेजमेंट (डेटा कभी मिक्स नहीं)',
      'समर्पित सर्वर रिसोर्स एवं 99.9% अपटाइम SLA',
      'कस्टम जीएसटी इनवॉइसिंग व सीए ऑडिट रिपोर्ट्स',
      'व्यक्तिगत खाता प्रबंधक (Dedicated Account Manager)',
    ],
  },
];

export interface SchoolSubscription {
  id: string;
  schoolId: string;
  planId: SubscriptionPlanId;
  planName: string;
  billingCycle: BillingCycle;
  pricePerCycle: number;
  discountPercent: number;
  status: 'Active' | 'Past_Due' | 'Canceled' | 'Trial';
  autoPayEnabled: boolean;
  paymentMethod: 'UPI AutoPay' | 'e-NACH Mandate' | 'Corporate Card';
  mandateId: string;
  mandateBank: string;
  nextBillingDate: string;
  periodStart: string;
  periodEnd: string;
  updatedAt: string;
}

export let schoolSubscriptionStore: SchoolSubscription = {
  id: 'sub-2026-001',
  schoolId: 'school-01',
  planId: 'enterprise',
  planName: 'एंटरप्राइज प्लान (Enterprise)',
  billingCycle: 'annual',
  pricePerCycle: 115188,
  discountPercent: 20,
  status: 'Active',
  autoPayEnabled: true,
  paymentMethod: 'UPI AutoPay',
  mandateId: 'MNDT-UPI-SBI-2026-90812',
  mandateBank: 'State Bank of India (SBI)',
  nextBillingDate: '2027-04-01',
  periodStart: '2026-04-01',
  periodEnd: '2027-03-31',
  updatedAt: new Date().toISOString(),
};

// -----------------------------------------------------------------------------
// Dual Email System & Add-ons
// -----------------------------------------------------------------------------
export interface SubscriptionAddon {
  id: string;
  schoolId: string;
  addonType: 'custom_domain_email' | 'extra_storage' | 'sms_broadcast';
  addonName: string;
  quantity: number;
  unitPrice: number;
  billingCycle: BillingCycle;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export const subscriptionAddonsStore: SubscriptionAddon[] = [
  {
    id: 'addon-01',
    schoolId: 'school-01',
    addonType: 'custom_domain_email',
    addonName: 'कस्टम डोमेन ऑफिशियल ईमेल पैक (10,000 ऑफिशियल मेल्स/माह)',
    quantity: 1,
    unitPrice: 499,
    billingCycle: 'monthly',
    status: 'Active',
    createdAt: '2026-04-01',
  },
];

export interface SchoolCustomDomain {
  id: string;
  schoolId: string;
  domainName: string;
  spfRecordStatus: 'Verified' | 'Pending' | 'Failed';
  dkimRecordStatus: 'Verified' | 'Pending' | 'Failed';
  mxRecordStatus: 'Verified' | 'Pending' | 'Failed';
  dmarcRecordStatus: 'Verified' | 'Pending' | 'Failed';
  isActive: boolean;
  monthlySendingQuota: number;
  monthlySentCount: number;
  configuredMailboxes: string[];
  createdAt: string;
}

export const schoolCustomDomainStore: SchoolCustomDomain = {
  id: 'dom-01',
  schoolId: 'school-01',
  domainName: 'vidyasetuschool.edu.in',
  spfRecordStatus: 'Verified',
  dkimRecordStatus: 'Verified',
  mxRecordStatus: 'Verified',
  dmarcRecordStatus: 'Verified',
  isActive: true,
  monthlySendingQuota: 10000,
  monthlySentCount: 342,
  configuredMailboxes: [
    'principal@vidyasetuschool.edu.in',
    'director@vidyasetuschool.edu.in',
    'accounts@vidyasetuschool.edu.in',
    'info@vidyasetuschool.edu.in',
  ],
  createdAt: '2026-04-01',
};

// -----------------------------------------------------------------------------
// Billing Invoices (Auto-Pay Receipts with GST)
// -----------------------------------------------------------------------------
export interface BillingInvoice {
  id: string;
  schoolId: string;
  invoiceNumber: string;
  description: string;
  planName: string;
  billingCycle: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  paymentStatus: 'Paid' | 'Pending' | 'Failed' | 'Processing';
  paymentMethod: string;
  transactionId: string;
  invoiceDate: string;
  dueDate: string;
  paidAt: string;
}

export const billingInvoicesStore: BillingInvoice[] = [
  {
    id: 'binv-01',
    schoolId: 'school-01',
    invoiceNumber: 'VS-INV-2026-0041',
    description: 'वार्षिक एंटरप्राइज सब्सक्रिप्शन (2026-27) + कस्टम डोमेन ईमेल ऐड-ऑन',
    planName: 'एंटरप्राइज प्लान (Enterprise)',
    billingCycle: 'वार्षिक (Annual - 20% छूट)',
    subtotal: 115188,
    gstPercent: 18,
    gstAmount: 20733.84,
    totalAmount: 135921.84,
    paymentStatus: 'Paid',
    paymentMethod: 'UPI AutoPay (मैंडेट द्वारा स्वतः चुकता)',
    transactionId: 'AUTOPAY-SBI-984021029',
    invoiceDate: '2026-04-01',
    dueDate: '2026-04-01',
    paidAt: '2026-04-01 06:00:12',
  },
];

// -----------------------------------------------------------------------------
// School-Isolated FCM Topics Engine
// Multi-Tenancy Guarantee: Every topic key is prefixed with `school_${schoolId}_`
// -----------------------------------------------------------------------------
export interface SchoolFcmTopic {
  id: string;
  schoolId: string;
  topicKey: string;      // e.g. "school_school-01_parents"
  displayName: string;
  targetRole: string;
  subscriberCount: number;
  description: string;
}

export const generateSchoolTopics = (schoolId: string): SchoolFcmTopic[] => [
  {
    id: `top-${schoolId}-all`,
    schoolId,
    topicKey: `school_${schoolId}_all`,
    displayName: 'संपूर्ण विद्यालय (सभी विद्यार्थी + अभिभावक + शिक्षक)',
    targetRole: 'All',
    subscriberCount: 650,
    description: 'आपातकालीन सूचना, अवकाश व सामान्य परिपत्र के लिए',
  },
  {
    id: `top-${schoolId}-parents`,
    schoolId,
    topicKey: `school_${schoolId}_parents`,
    displayName: 'केवल अभिभावक (Parents Topic)',
    targetRole: 'Parents',
    subscriberCount: 420,
    description: 'पीटीएम, गृहकार्य व अभिभावक बैठक संदेश',
  },
  {
    id: `top-${schoolId}-students`,
    schoolId,
    topicKey: `school_${schoolId}_students`,
    displayName: 'केवल विद्यार्थी (Students Topic)',
    targetRole: 'Students',
    subscriberCount: 500,
    description: 'कक्षा कार्य, परीक्षा सारणी व शैक्षणिक सूचना',
  },
  {
    id: `top-${schoolId}-teachers`,
    schoolId,
    topicKey: `school_${schoolId}_teachers`,
    displayName: 'शिक्षक एवं स्टाफ (Staff & Teachers Topic)',
    targetRole: 'Teachers',
    subscriberCount: 38,
    description: 'स्टाफ बैठक, परिपत्र व प्रशासनिक निर्देश',
  },
  {
    id: `top-${schoolId}-fees-due`,
    schoolId,
    topicKey: `school_${schoolId}_fees_due`,
    displayName: 'शुल्क अनुस्मारक (Fees Due Reminder Topic)',
    targetRole: 'Parents',
    subscriberCount: 84,
    description: 'त्रैमासिक व मासिक फीस देय तिथि अलर्ट',
  },
  {
    id: `top-${schoolId}-board-10`,
    schoolId,
    topicKey: `school_${schoolId}_class_10`,
    displayName: 'कक्षा 10वीं बोर्ड परीक्षार्थी',
    targetRole: 'Students',
    subscriberCount: 72,
    description: 'बोर्ड परीक्षा, प्रैक्टिकल व प्रवेश पत्र सूचना',
  },
];

export let schoolFcmTopicsStore: SchoolFcmTopic[] = generateSchoolTopics('school-01');
