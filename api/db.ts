// Shared types, plan definitions and empty (no-demo-data) fallback stores.
// Real data is read/written through Cloudflare D1 via c.env.DB in each API route.

export type UserRole = 'Director' | 'Principal' | 'Staff';
export type PlatformRole = 'SuperAdmin' | UserRole;

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
  passwordHash?: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  designation: string;
  department: string;
  qualification: string;
  salary: number;
  status: 'Active' | 'Inactive';
  schoolId: string;
  lastLogin?: string;
  createdAt: string;
}

export interface PlatformAdmin {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
}

export interface PrincipalHistoryRecord {
  id: string;
  schoolId: string;
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
  scholarNumber: string;
  rollNumber: string;
  fullName: string;
  fatherName: string;
  fatherOccupation: string;
  motherName: string;
  className: string;
  section: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  category: 'General' | 'OBC' | 'SC' | 'ST' | 'EWS';
  religion: string;
  aadhaarNumber: string;
  samagraId: string;
  bloodGroup: string;
  parentPhone: string;
  whatsappNumber: string;
  email: string;
  currentAddress: string;
  permanentAddress: string;
  previousSchool: string;
  previousTcNo: string;
  admissionDate: string;
  bankAccountNo: string;
  bankName: string;
  ifscCode: string;
  status: 'Active' | 'TC_Issued' | 'Suspended' | 'Passed_Out' | 'Inactive';
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

export interface SchoolTenant {
  id: string;
  schoolName: string;
  subdomain: string;
  customDomain?: string;
  contactEmail: string;
  contactPhone: string;
  status: 'Active' | 'Suspended' | 'Trial';
  registrationStatus?: 'Pending_Approval' | 'Approved' | 'Rejected' | 'Active' | 'Deleted';
  planId?: string;
  trialEndsAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  deletedAt?: string;
  createdAt: string;
}

export type SubscriptionPlanId = string;
export type BillingCycle = 'monthly' | 'quarterly' | 'annual';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface SubscriptionPlanDefinition {
  id: string;
  name: string;
  tagline: string;
  badge?: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  maxStudents: string;
  features: string[];
  recommended?: boolean;
  modules?: string[];
  featureFlags?: Record<string, boolean>;
  maxStudentsLimit?: number | null;
  maxStaffLimit?: number | null;
  maxStaff?: number | null;
  active?: boolean;
  isTrial?: boolean;
  sortOrder?: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanDefinition[] = [
  {
    id: 'trial',
    name: '7-दिन फ्री ट्रायल',
    tagline: 'नए स्कूल पंजीकरण हेतु निःशुल्क परीक्षण (Super Admin अप्रूवल के बाद 7 दिन)',
    badge: 'फ्री',
    monthlyPrice: 0,
    quarterlyPrice: 0,
    annualPrice: 0,
    maxStudents: '50 विद्यार्थी',
    maxStudentsLimit: 50,
    maxStaffLimit: 10,
    maxStaff: 10,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing'],
    features: [
      'डैशबोर्ड व स्कूल प्रोफ़ाइल सेटअप',
      'स्कॉलर रजिस्टर (अधिकतम 50 छात्र)',
      'दैनिक छात्र उपस्थिति',
      'स्टाफ निर्देशिका (अधिकतम 10 सदस्य)',
      'नोटिस पट्ट व सूचना',
      'बुनियादी फीस चालान',
    ],
    featureFlags: { reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false },
    active: true,
    isTrial: true,
    sortOrder: 0,
  },
  {
    id: 'starter',
    name: 'स्टार्टर प्लान (Starter)',
    tagline: 'प्राथमिक विद्यालयों (500 छात्रों तक) के लिए उपयुक्त',
    monthlyPrice: 2499,
    quarterlyPrice: 7122,
    annualPrice: 23988,
    maxStudents: '500 विद्यार्थी',
    maxStudentsLimit: 500,
    maxStaffLimit: 25,
    maxStaff: 25,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'settings', 'billing'],
    features: [
      'डिजिटल स्कॉलर रजिस्टर (दाखिला-खारिज)',
      'दैनिक छात्र उपस्थिति',
      'निदेशक, प्रधानाचार्य व शिक्षक 3-रोल व्यवस्था',
      'फीस रसीद व चालान निर्माण',
      'सामान्य ईमेल सूचना सेवा',
      'परीक्षा व अंक प्रविष्टि (बेसिक)',
    ],
    featureFlags: { reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false },
    active: true,
    isTrial: false,
    sortOrder: 1,
  },
  {
    id: 'pro',
    name: 'प्रोफेशनल प्लान (Professional)',
    tagline: 'सीनियर सेकेंडरी व तेजी से बढ़ते विद्यालयों (1500 छात्रों तक) के लिए',
    badge: 'सर्वाधिक लोकप्रिय',
    recommended: true,
    monthlyPrice: 5999,
    quarterlyPrice: 17097,
    annualPrice: 57588,
    maxStudents: '1500 विद्यार्थी',
    maxStudentsLimit: 1500,
    maxStaffLimit: 100,
    maxStaff: 100,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'principal', 'settings', 'billing'],
    features: [
      'स्टार्टर की सभी सुविधाएं',
      'विस्तृत रिपोर्ट कार्ड व परीक्षा परिणाम',
      'प्रधानाचार्य नियुक्ति एवं इतिहास',
      'ऑटो-पे रिकरिंग बिलिंग (UPI/e-NACH)',
      'कस्टम डोमेन ईमेल ऐड-ऑन',
      'प्राथमिकता तकनीकी सहायता',
    ],
    featureFlags: { reportCards: true, principalHistory: true, autopay: true, domainEmail: true, multiSchool: false, prioritySupport: true, customDomainIncluded: false },
    active: true,
    isTrial: false,
    sortOrder: 2,
  },
  {
    id: 'enterprise',
    name: 'एंटरप्राइज प्लान (Enterprise)',
    tagline: 'बड़े संस्थानों, ट्रस्ट व बहु-शाखा ग्रुप ऑफ स्कूल्स के लिए',
    badge: 'असीमित क्षमता',
    monthlyPrice: 11999,
    quarterlyPrice: 34197,
    annualPrice: 115188,
    maxStudents: 'असीमित विद्यार्थी',
    maxStudentsLimit: null,
    maxStaffLimit: null,
    maxStaff: null,
    modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'principal', 'settings', 'billing'],
    features: [
      'प्रो की सभी सुविधाएं',
      'कस्टम डोमेन ऑफिशियल ईमेल (शामिल)',
      'मल्टी-स्कूल टेनेंसी मैनेजमेंट',
      'GST इनवॉइसिंग व ऑडिट रिपोर्ट्स',
      'डेडिकेटेड अकाउंट मैनेजर',
      '99.9% अपटाइम SLA',
    ],
    featureFlags: { reportCards: true, principalHistory: true, autopay: true, domainEmail: true, multiSchool: true, prioritySupport: true, customDomainIncluded: true },
    active: true,
    isTrial: false,
    sortOrder: 3,
  },
];

function parseJson(value: any, fallback: any) {
  try { return JSON.parse(value); } catch (e) { return fallback; }
}

export function planRowToDefinition(row: any): SubscriptionPlanDefinition {
  const maxStudentsLimit = row.max_students === null || row.max_students === undefined ? null : Number(row.max_students);
  const maxStaffLimit = row.max_staff === null || row.max_staff === undefined ? null : Number(row.max_staff);
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline || '',
    badge: row.badge || undefined,
    monthlyPrice: Number(row.monthly_price) || 0,
    quarterlyPrice: Number(row.quarterly_price) || 0,
    annualPrice: Number(row.annual_price) || 0,
    maxStudents: row.max_students_label || (maxStudentsLimit === null ? 'असीमित विद्यार्थी' : maxStudentsLimit + ' विद्यार्थी'),
    features: parseJson(row.features, []),
    recommended: !!row.recommended,
    modules: parseJson(row.modules, []),
    featureFlags: parseJson(row.feature_flags, {}),
    maxStudentsLimit,
    maxStaffLimit,
    maxStaff: maxStaffLimit,
    active: row.active === undefined ? true : !!row.active,
    isTrial: !!row.is_trial,
    sortOrder: Number(row.sort_order) || 0,
  };
}

export async function loadSubscriptionPlans(db: any): Promise<SubscriptionPlanDefinition[]> {
  if (!db) return SUBSCRIPTION_PLANS;
  try {
    const res = await db.prepare('SELECT * FROM subscription_plans ORDER BY sort_order ASC, created_at ASC').all();
    const rows = (res && res.results) || [];
    if (!rows.length) return SUBSCRIPTION_PLANS;
    return rows.map(planRowToDefinition);
  } catch (e) {
    return SUBSCRIPTION_PLANS;
  }
}

export async function loadSubscriptionPlanById(db: any, id: any): Promise<SubscriptionPlanDefinition | undefined> {
  if (!db) return SUBSCRIPTION_PLANS.find((p) => p.id === id);
  try {
    const row = await db.prepare('SELECT * FROM subscription_plans WHERE id = ?').bind(id).first();
    if (!row) return SUBSCRIPTION_PLANS.find((p) => p.id === id);
    return planRowToDefinition(row);
  } catch (e) {
    return SUBSCRIPTION_PLANS.find((p) => p.id === id);
  }
}

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
  paymentMethod: string;
  mandateId: string;
  mandateBank: string;
  nextBillingDate: string;
  periodStart: string;
  periodEnd: string;
  trialEndsAt?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  updatedAt: string;
}

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
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
}

export interface SchoolFcmTopic {
  id: string;
  schoolId: string;
  topicKey: string;
  displayName: string;
  targetRole: string;
  subscriberCount: number;
  description: string;
}

export const generateSchoolTopics = (schoolId: string): SchoolFcmTopic[] => [
  { id: 'top-' + schoolId + '-all', schoolId, topicKey: 'school_' + schoolId + '_all', displayName: 'संपूर्ण विद्यालय (सभी)', targetRole: 'All', subscriberCount: 0, description: 'आपातकालीन सूचना, अवकाश व सामान्य परिपत्र' },
  { id: 'top-' + schoolId + '-parents', schoolId, topicKey: 'school_' + schoolId + '_parents', displayName: 'केवल अभिभावक', targetRole: 'Parents', subscriberCount: 0, description: 'पीटीएम व अभिभावक बैठक संदेश' },
  { id: 'top-' + schoolId + '-students', schoolId, topicKey: 'school_' + schoolId + '_students', displayName: 'केवल विद्यार्थी', targetRole: 'Students', subscriberCount: 0, description: 'परीक्षा सारणी व शैक्षणिक सूचना' },
  { id: 'top-' + schoolId + '-teachers', schoolId, topicKey: 'school_' + schoolId + '_teachers', displayName: 'शिक्षक एवं स्टाफ', targetRole: 'Teachers', subscriberCount: 0, description: 'स्टाफ बैठक व प्रशासनिक निर्देश' },
  { id: 'top-' + schoolId + '-fees-due', schoolId, topicKey: 'school_' + schoolId + '_fees_due', displayName: 'शुल्क अनुस्मारक', targetRole: 'Parents', subscriberCount: 0, description: 'फीस देय तिथि अलर्ट' },
];

// Empty fallback stores (no demo data). Real routes use D1.
export const schoolProfile: SchoolProfile = { id: 'school-01', schoolName: '', affiliationNumber: '', boardName: 'CBSE', schoolCode: '', email: '', phone: '', alternatePhone: '', address: '', city: '', state: '', pincode: '', academicSession: '2026-2027', directorName: '', principalName: '', updatedAt: '' };
export const systemUsers: SystemUser[] = [];
export const principalHistory: PrincipalHistoryRecord[] = [];
export const studentScholars: StudentScholar[] = [];
export const initialStudents = studentScholars;
export const staffMembers: TeacherStaff[] = [];
export const feeInvoices: FeeInvoice[] = [];
export const schoolNotices: Notice[] = [];
export const noticesStore: Notice[] = schoolNotices;
export const initialNotices = noticesStore;
export const attendanceStore: AttendanceRecord[] = [];
export const examRecords: ExamRecord[] = [];
export const notificationHistory: any[] = [];
export const schoolTenants: SchoolTenant[] = [];
export let currentSchoolId = 'school-01';
export const setCurrentSchoolId = (id: string) => { currentSchoolId = id; };
export const schoolSubscriptionStore: SchoolSubscription = { id: '', schoolId: 'school-01', planId: 'trial', planName: '7-दिन फ्री ट्रायल', billingCycle: 'monthly', pricePerCycle: 0, discountPercent: 0, status: 'Trial', autoPayEnabled: false, paymentMethod: '', mandateId: '', mandateBank: '', nextBillingDate: '', periodStart: '', periodEnd: '', updatedAt: '' };
export const subscriptionAddonsStore: SubscriptionAddon[] = [];
export const schoolCustomDomainStore: SchoolCustomDomain = { id: '', schoolId: 'school-01', domainName: '', spfRecordStatus: 'Pending', dkimRecordStatus: 'Pending', mxRecordStatus: 'Pending', dmarcRecordStatus: 'Pending', isActive: false, monthlySendingQuota: 10000, monthlySentCount: 0, configuredMailboxes: [], createdAt: '' };
export const billingInvoicesStore: BillingInvoice[] = [];
export const schoolFcmTopicsStore: SchoolFcmTopic[] = generateSchoolTopics('school-01');

// Minimal D1 typing so route handlers get contextual types for rows/results.
export interface D1Row { [key: string]: any; }
export interface D1Statement {
  bind(...values: any[]): D1Statement;
  first(): Promise<any>;
  all(): Promise<{ results?: any[] }>;
  run(): Promise<any>;
}
export interface MiniD1 {
  prepare(query: string): D1Statement;
}

// D1 access helper. Each route reads/writes real data through this binding.
export function getDB(c: any): MiniD1 {
  return (c && c.env && c.env.DB) as MiniD1;
}
