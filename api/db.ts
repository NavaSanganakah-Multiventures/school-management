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

// Clean Student Scholars List (Completely empty of demo data, ready for real entries)
export const studentScholars: StudentScholar[] = [];

export const initialStudents = studentScholars;

// Clean Staff & Teachers Directory
export const staffMembers: TeacherStaff[] = [];

// Clean Fee Invoices List
export const feeInvoices: FeeInvoice[] = [];

// Clean School Notices List
export const schoolNotices: Notice[] = [];
export const noticesStore: Notice[] = schoolNotices;
export const initialNotices = noticesStore;

// Clean Attendance Store
export const attendanceStore: AttendanceRecord[] = [];

// Clean Exam Records
export const examRecords: ExamRecord[] = [];

// Clean Notification History
export const notificationHistory: Array<{
  id: string;
  messageId: string;
  title: string;
  body: string;
  targetTopic: string;
  recipientToken?: string;
  deliveryStatus: string;
  sentAt: string;
}> = [];
