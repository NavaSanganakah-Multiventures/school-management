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

// Student Scholars List (स्कॉलर रजिस्टर दाखिला-खारिज)
export const studentScholars: StudentScholar[] = [
  {
    id: 'std-001',
    scholarNumber: 'SR-2026/101',
    rollNumber: '101',
    fullName: 'आरव शर्मा (Aarav Sharma)',
    fatherName: 'श्री राजेश शर्मा',
    fatherOccupation: 'व्यवसायी (Business)',
    motherName: 'श्रीमती सुनीता शर्मा',
    className: 'Class 10',
    section: 'A',
    dob: '2010-04-12',
    gender: 'Male',
    category: 'General',
    religion: 'Hindu',
    aadhaarNumber: '4532 8912 3421',
    samagraId: '102938475',
    bloodGroup: 'B+',
    parentPhone: '+91 98765 43210',
    whatsappNumber: '+91 98765 43210',
    email: 'rajesh.sharma@example.com',
    currentAddress: 'मकान नं. 45, सिविल लाइन्स, मुख्य मार्ग',
    permanentAddress: 'मकान नं. 45, सिविल लाइन्स, मुख्य मार्ग',
    previousSchool: 'सरस्वती शिशु मंदिर',
    previousTcNo: 'TC-892/2024',
    admissionDate: '2024-04-05',
    bankAccountNo: '9876543210123',
    bankName: 'State Bank of India',
    ifscCode: 'SBIN0001234',
    status: 'Active',
    remarks: 'शैक्षणिक एवं खेलकूद में उत्कृष्ट',
  },
  {
    id: 'std-002',
    scholarNumber: 'SR-2026/102',
    rollNumber: '102',
    fullName: 'अनन्या वर्मा (Ananya Verma)',
    fatherName: 'श्री दिनेश वर्मा',
    fatherOccupation: 'शासकीय सेवा (Govt Officer)',
    motherName: 'श्रीमती कविता वर्मा',
    className: 'Class 10',
    section: 'A',
    dob: '2010-08-22',
    gender: 'Female',
    category: 'OBC',
    religion: 'Hindu',
    aadhaarNumber: '7823 4512 9012',
    samagraId: '987612345',
    bloodGroup: 'O+',
    parentPhone: '+91 98234 56789',
    whatsappNumber: '+91 98234 56789',
    email: 'dinesh.verma@example.com',
    currentAddress: 'प्लॉट 12, शिक्षक कॉलोनी, निकट पार्क',
    permanentAddress: 'प्लॉट 12, शिक्षक कॉलोनी, निकट पार्क',
    previousSchool: 'सेंट ज़ेवियर्स स्कूल',
    previousTcNo: 'TC-451/2023',
    admissionDate: '2023-04-10',
    bankAccountNo: '4567890123456',
    bankName: 'Punjab National Bank',
    ifscCode: 'PUNB0123400',
    status: 'Active',
    remarks: 'कक्षा मॉनिटर एवं विज्ञान क्लब प्रमुख',
  },
  {
    id: 'std-003',
    scholarNumber: 'SR-2026/103',
    rollNumber: '103',
    fullName: 'ईशान खान (Ishaan Khan)',
    fatherName: 'जनाब इमरान खान',
    fatherOccupation: 'इंजीनियर (Engineer)',
    motherName: 'श्रीमती शबनम खान',
    className: 'Class 10',
    section: 'A',
    dob: '2010-01-15',
    gender: 'Male',
    category: 'General',
    religion: 'Muslim',
    aadhaarNumber: '8901 2345 6789',
    samagraId: '456789123',
    bloodGroup: 'A+',
    parentPhone: '+91 99887 76655',
    whatsappNumber: '+91 99887 76655',
    email: 'imran.khan@example.com',
    currentAddress: 'एच-24, ग्रीन एवेन्यू, सेक्टर 4',
    permanentAddress: 'एच-24, ग्रीन एवेन्यू, सेक्टर 4',
    previousSchool: 'डीपीएस पब्लिक स्कूल',
    previousTcNo: 'TC-110/2024',
    admissionDate: '2024-04-02',
    bankAccountNo: '7890123456789',
    bankName: 'HDFC Bank',
    ifscCode: 'HDFC0002345',
    status: 'Active',
    remarks: 'गणित एवं वाद-विवाद प्रतियोगिता विजेता',
  },
  {
    id: 'std-004',
    scholarNumber: 'SR-2026/104',
    rollNumber: '104',
    fullName: 'प्रिया पटेल (Priya Patel)',
    fatherName: 'श्री रमेश पटेल',
    fatherOccupation: 'कृषि एवं व्यापार',
    motherName: 'श्रीमती गीता पटेल',
    className: 'Class 12',
    section: 'Science',
    dob: '2008-11-05',
    gender: 'Female',
    category: 'OBC',
    religion: 'Hindu',
    aadhaarNumber: '3412 7890 2345',
    samagraId: '234567890',
    bloodGroup: 'AB+',
    parentPhone: '+91 97654 32190',
    whatsappNumber: '+91 97654 32190',
    email: 'ramesh.patel@example.com',
    currentAddress: 'पटेल नगर, मुख्य चौराहा',
    permanentAddress: 'पटेल नगर, मुख्य चौराहा',
    previousSchool: 'विद्या सेतु स्कूल',
    previousTcNo: '',
    admissionDate: '2020-04-01',
    bankAccountNo: '1234567890123',
    bankName: 'Bank of Baroda',
    ifscCode: 'BARB0VISHAL',
    status: 'Active',
    remarks: 'जीव विज्ञान एवं नीट (NEET) आकांक्षी',
  },
  {
    id: 'std-005',
    scholarNumber: 'SR-2025/089',
    rollNumber: '89',
    fullName: 'रोहन जोशी (Rohan Joshi)',
    fatherName: 'श्री मनोज जोशी',
    fatherOccupation: 'अधिवक्ता (Advocate)',
    motherName: 'श्रीमती नीलम जोशी',
    className: 'Class 9',
    section: 'B',
    dob: '2011-06-18',
    gender: 'Male',
    category: 'General',
    religion: 'Hindu',
    aadhaarNumber: '6789 0123 4567',
    samagraId: '345678901',
    bloodGroup: 'B-',
    parentPhone: '+91 98123 45670',
    whatsappNumber: '+91 98123 45670',
    email: 'manoj.joshi@example.com',
    currentAddress: 'वकील कॉलोनी, कोर्ट रोड',
    permanentAddress: 'वकील कॉलोनी, कोर्ट रोड',
    previousSchool: 'केंद्रीय विद्यालय',
    previousTcNo: 'TC-900/2025',
    admissionDate: '2025-07-10',
    bankAccountNo: '2345678901234',
    bankName: 'State Bank of India',
    ifscCode: 'SBIN0004567',
    status: 'TC_Issued',
    tcIssueDate: '2026-03-20',
    remarks: 'पिता के स्थानांतरण के कारण टीसी जारी की गई',
  },
];

export const initialStudents = studentScholars;

// Staff & Teachers Directory
export const staffMembers: TeacherStaff[] = [
  {
    id: 'stf-001',
    employeeCode: 'EMP-01',
    name: 'श्रीमती रेखा वर्मा',
    designation: 'वरिष्ठ प्रवक्ता (PGT Maths)',
    department: 'गणित संकाय (Mathematics)',
    subject: 'उच्च गणित',
    phone: '+91 94123 45678',
    email: 'rekha.verma@vidyasetuschool.edu.in',
    qualification: 'M.Sc. (Mathematics), B.Ed.',
    salary: 68000,
    status: 'Active',
    joiningDate: '2021-07-15',
  },
  {
    id: 'stf-002',
    employeeCode: 'EMP-02',
    name: 'श्री विनीत सक्सेना',
    designation: 'वरिष्ठ प्रवक्ता (PGT Physics)',
    department: 'विज्ञान संकाय (Science)',
    subject: 'भौतिक विज्ञान',
    phone: '+91 98234 11223',
    email: 'vineet.saxena@vidyasetuschool.edu.in',
    qualification: 'M.Sc. (Physics), B.Ed.',
    salary: 65000,
    status: 'Active',
    joiningDate: '2022-04-10',
  },
  {
    id: 'stf-003',
    employeeCode: 'EMP-03',
    name: 'डॉ. मीनाक्षी चतुर्वेदी',
    designation: 'प्रवक्ता (PGT Hindi Literature)',
    department: 'भाषा संकाय (Languages)',
    subject: 'हिंदी साहित्य एवं व्याकरण',
    phone: '+91 97123 99887',
    email: 'meenakshi.c@vidyasetuschool.edu.in',
    qualification: 'M.A. (Hindi), Ph.D., B.Ed.',
    salary: 62000,
    status: 'Active',
    joiningDate: '2020-08-01',
  },
  {
    id: 'stf-004',
    employeeCode: 'EMP-04',
    name: 'श्री दीपक चौहान',
    designation: 'प्रशिक्षित स्नातक शिक्षक (TGT Social Science)',
    department: 'सामाजिक विज्ञान संकाय',
    subject: 'इतिहास एवं नागरिक शास्त्र',
    phone: '+91 96543 21098',
    email: 'deepak.chauhan@vidyasetuschool.edu.in',
    qualification: 'M.A. (History), B.Ed.',
    salary: 48000,
    status: 'Active',
    joiningDate: '2023-06-12',
  },
  {
    id: 'stf-005',
    employeeCode: 'EMP-05',
    name: 'श्री रविंद्र सिंह',
    designation: 'शारीरिक शिक्षक (PTI / Sports Head)',
    department: 'शारीरिक शिक्षा एवं खेलकूद',
    subject: 'शारीरिक शिक्षा ও योग',
    phone: '+91 95432 10987',
    email: 'ravindra.singh@vidyasetuschool.edu.in',
    qualification: 'M.P.Ed.',
    salary: 45000,
    status: 'Active',
    joiningDate: '2021-11-20',
  },
];

// Fee Invoices List
export const feeInvoices: FeeInvoice[] = [
  {
    id: 'inv-001',
    invoiceNumber: 'INV-2026/041',
    studentId: 'std-001',
    studentName: 'आरव शर्मा',
    scholarNumber: 'SR-2026/101',
    className: 'Class 10',
    section: 'A',
    title: 'प्रथम त्रैमासिक ट्यूशन एवं विकास शुल्क (Q1)',
    totalAmount: 18500,
    paidAmount: 18500,
    dueDate: '2026-04-15',
    status: 'Paid',
    paymentMethod: 'UPI / NetBanking',
    transactionId: 'UPI-9842109283',
    paidAt: '2026-04-10 11:30',
  },
  {
    id: 'inv-002',
    invoiceNumber: 'INV-2026/042',
    studentId: 'std-002',
    studentName: 'अनन्या वर्मा',
    scholarNumber: 'SR-2026/102',
    className: 'Class 10',
    section: 'A',
    title: 'प्रथम त्रैमासिक ट्यूशन एवं कंप्यूटर लैब शुल्क (Q1)',
    totalAmount: 19200,
    paidAmount: 19200,
    dueDate: '2026-04-15',
    status: 'Paid',
    paymentMethod: 'बैंक चालान (SBI Challan)',
    transactionId: 'CHL-883492',
    paidAt: '2026-04-12 14:15',
  },
  {
    id: 'inv-003',
    invoiceNumber: 'INV-2026/043',
    studentId: 'std-003',
    studentName: 'ईशान खान',
    scholarNumber: 'SR-2026/103',
    className: 'Class 10',
    section: 'A',
    title: 'प्रथम त्रैमासिक ट्यूशन शुल्क (Q1)',
    totalAmount: 18500,
    paidAmount: 10000,
    dueDate: '2026-04-15',
    status: 'Partial',
    paymentMethod: 'ऑनलाइन कार्ड भुगतान',
    transactionId: 'TXN-7729103',
    paidAt: '2026-04-14 09:45',
  },
  {
    id: 'inv-004',
    invoiceNumber: 'INV-2026/044',
    studentId: 'std-004',
    studentName: 'प्रिया पटेल',
    scholarNumber: 'SR-2026/104',
    className: 'Class 12',
    section: 'Science',
    title: 'कक्षा 12वीं विज्ञान संकाय एवं लैब शुल्क',
    totalAmount: 24500,
    paidAmount: 0,
    dueDate: '2026-04-20',
    status: 'Unpaid',
  },
];

// School Notices List
export const schoolNotices: Notice[] = [
  {
    id: 'not-001',
    title: 'सत्र 2026-27: कक्षा 10वीं व 12वीं के लिए विशेष अतिरिक्त कक्षाएं',
    content: 'बोर्ड परीक्षा में उत्कृष्ट परिणाम सुनिश्चित करने हेतु आगामी सोमवार से प्रातः 8:00 बजे से गणित एवं विज्ञान की विशेष कक्षाएं संचालित की जाएंगी।',
    category: 'Academic',
    targetAudience: 'All',
    publishedBy: 'डॉ. आनंद मोहन त्रिवेदी (प्रधानाचार्य)',
    publishedDate: '2026-09-08',
    priority: 'High',
    alertSent: true,
  },
  {
    id: 'not-002',
    title: 'द्वितीय त्रैमासिक शुल्क जमा करने संबंधी अंतिम अनुस्मारक',
    content: 'सभी अभिभावकों से सादर अनुरोध है कि सत्र 2026-27 के द्वितीय त्रैमास की देय फीस 15 तारीख तक ऑनलाइन पोर्टल या विद्यालय काउंटर पर अवश्य जमा करवाएं।',
    category: 'General',
    targetAudience: 'Parents',
    publishedBy: 'सत्यप्रकाश शर्मा (निदेशक)',
    publishedDate: '2026-09-05',
    priority: 'Normal',
    alertSent: true,
  },
  {
    id: 'not-003',
    title: 'अंतर-विद्यालयीन खेलकूद एवं वाद-विवाद प्रतियोगिता पंजीकरण',
    content: 'वार्षिक सीबीएसई संकुल स्तरीय खेलकूद एवं भाषण प्रतियोगिता में भाग लेने के इच्छुक छात्र-छात्राएं अपने कक्षाध्यापक के पास 12 तारीख तक नाम दर्ज करवाएं।',
    category: 'Sports',
    targetAudience: 'Students',
    publishedBy: 'रविंद्र सिंह (खेल विभाग)',
    publishedDate: '2026-09-02',
    priority: 'Normal',
    alertSent: true,
  },
];
export const noticesStore: Notice[] = schoolNotices;
export const initialNotices = noticesStore;

// Attendance Store (आज की दैनिक उपस्थिति)
export const attendanceStore: AttendanceRecord[] = [
  {
    id: 'att-001',
    studentId: 'std-001',
    studentName: 'आरव शर्मा',
    scholarNumber: 'SR-2026/101',
    className: 'Class 10',
    section: 'A',
    date: new Date().toISOString().split('T')[0],
    status: 'Present',
    markedBy: 'श्रीमती रेखा वर्मा',
  },
  {
    id: 'att-002',
    studentId: 'std-002',
    studentName: 'अनन्या वर्मा',
    scholarNumber: 'SR-2026/102',
    className: 'Class 10',
    section: 'A',
    date: new Date().toISOString().split('T')[0],
    status: 'Present',
    markedBy: 'श्रीमती रेखा वर्मा',
  },
  {
    id: 'att-003',
    studentId: 'std-003',
    studentName: 'ईशान खान',
    scholarNumber: 'SR-2026/103',
    className: 'Class 10',
    section: 'A',
    date: new Date().toISOString().split('T')[0],
    status: 'Present',
    markedBy: 'श्रीमती रेखा वर्मा',
  },
  {
    id: 'att-004',
    studentId: 'std-004',
    studentName: 'प्रिया पटेल',
    scholarNumber: 'SR-2026/104',
    className: 'Class 12',
    section: 'Science',
    date: new Date().toISOString().split('T')[0],
    status: 'Present',
    markedBy: 'श्री विनीत सक्सेना',
  },
];

// Exam Records
export const examRecords: ExamRecord[] = [
  {
    id: 'exm-001',
    examName: 'प्रथम आवधिक परीक्षा (Periodic Test 1)',
    studentId: 'std-001',
    scholarNumber: 'SR-2026/101',
    studentName: 'आरव शर्मा',
    className: 'Class 10',
    subject: 'गणित (Mathematics)',
    marksObtained: 94,
    maxMarks: 100,
    grade: 'A1',
    remarks: 'अत्यंत मेधावी एवं सटीक हल',
  },
  {
    id: 'exm-002',
    examName: 'प्रथम आवधिक परीक्षा (Periodic Test 1)',
    studentId: 'std-001',
    scholarNumber: 'SR-2026/101',
    studentName: 'आरव शर्मा',
    className: 'Class 10',
    subject: 'विज्ञान (Science)',
    marksObtained: 91,
    maxMarks: 100,
    grade: 'A1',
    remarks: 'प्रायोगिक एवं सैद्धांतिक दोनों में उत्तम',
  },
  {
    id: 'exm-003',
    examName: 'प्रथम आवधिक परीक्षा (Periodic Test 1)',
    studentId: 'std-002',
    scholarNumber: 'SR-2026/102',
    studentName: 'अनन्या वर्मा',
    className: 'Class 10',
    subject: 'गणित (Mathematics)',
    marksObtained: 96,
    maxMarks: 100,
    grade: 'A1',
    remarks: 'कक्षा में सर्वोच्च अंक',
  },
  {
    id: 'exm-004',
    examName: 'प्रथम आवधिक परीक्षा (Periodic Test 1)',
    studentId: 'std-003',
    scholarNumber: 'SR-2026/103',
    studentName: 'ईशान खान',
    className: 'Class 10',
    subject: 'सामाजिक विज्ञान (Social Science)',
    marksObtained: 88,
    maxMarks: 100,
    grade: 'A2',
    remarks: 'विश्लेषणात्मक लेखन उत्तम',
  },
];

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
