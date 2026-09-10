import { Hono } from 'hono';
import { studentScholars } from '../db';

const examsApp = new Hono();

export interface SubjectMarks {
  subject: string;
  marks: number;
  maxMarks: number;
  grade: string;
}

export interface ReportCard {
  studentId: string;
  studentName: string;
  rollNumber: string;
  className: string;
  term: string;
  subjects: SubjectMarks[];
  totalMarks: number;
  maxTotal: number;
  percentage: number;
  finalGrade: string;
  result: 'Pass' | 'Fail';
}

const mockReportCards: Record<string, ReportCard> = {
  'std-101': {
    studentId: 'std-101',
    studentName: 'आरव शर्मा',
    rollNumber: '101',
    className: 'Class 10',
    term: 'प्रथम सत्र परीक्षा (Term 1 Examination 2026)',
    subjects: [
      { subject: 'गणित (Mathematics)', marks: 95, maxMarks: 100, grade: 'A+' },
      { subject: 'विज्ञान (Science)', marks: 88, maxMarks: 100, grade: 'A' },
      { subject: 'अंग्रेजी (English)', marks: 84, maxMarks: 100, grade: 'A' },
      { subject: 'हिंदी (Hindi)', marks: 91, maxMarks: 100, grade: 'A+' },
      { subject: 'सामाजिक विज्ञान (Social Studies)', marks: 86, maxMarks: 100, grade: 'A' },
    ],
    totalMarks: 444,
    maxTotal: 500,
    percentage: 88.8,
    finalGrade: 'A+',
    result: 'Pass',
  },
  'std-102': {
    studentId: 'std-102',
    studentName: 'अनन्या पटेल',
    rollNumber: '102',
    className: 'Class 10',
    term: 'प्रथम सत्र परीक्षा (Term 1 Examination 2026)',
    subjects: [
      { subject: 'गणित (Mathematics)', marks: 98, maxMarks: 100, grade: 'A+' },
      { subject: 'विज्ञान (Science)', marks: 96, maxMarks: 100, grade: 'A+' },
      { subject: 'अंग्रेजी (English)', marks: 92, maxMarks: 100, grade: 'A+' },
      { subject: 'हिंदी (Hindi)', marks: 89, maxMarks: 100, grade: 'A' },
      { subject: 'कंप्यूटर (Computer Science)', marks: 99, maxMarks: 100, grade: 'A+' },
    ],
    totalMarks: 474,
    maxTotal: 500,
    percentage: 94.8,
    finalGrade: 'A+',
    result: 'Pass',
  },
};

// GET all exam schedules and overview
examsApp.get('/', (c) => {
  return c.json({
    success: true,
    exams: [
      {
        id: 'ex-01',
        name: 'द्वितीय सावधिक परीक्षा (Mid-Term Exam 2026)',
        classes: 'Class 9th to 12th',
        startDate: '2026-09-25',
        endDate: '2026-10-05',
        status: 'Upcoming',
      },
      {
        id: 'ex-02',
        name: 'मासिक इकाई परीक्षा (Monthly Unit Test 3)',
        classes: 'Class 1st to 8th',
        startDate: '2026-09-18',
        endDate: '2026-09-22',
        status: 'Scheduled',
      },
    ],
  });
});

// GET report card for a student
examsApp.get('/report-card/:studentId', (c) => {
  const studentId = c.req.param('studentId');
  const card = mockReportCards[studentId];

  if (!card) {
    const student = studentScholars.find((s) => s.id === studentId);
    if (!student) {
      return c.json({ success: false, message: 'छात्र रिपोर्ट कार्ड नहीं मिला' }, 404);
    }

    const defaultCard: ReportCard = {
      studentId: student.id,
      studentName: student.fullName,
      rollNumber: student.rollNumber,
      className: student.className,
      term: 'प्रथम सत्र परीक्षा (Term 1 Examination 2026)',
      subjects: [
        { subject: 'गणित (Mathematics)', marks: 82, maxMarks: 100, grade: 'A' },
        { subject: 'विज्ञान (Science)', marks: 79, maxMarks: 100, grade: 'B+' },
        { subject: 'अंग्रेजी (English)', marks: 85, maxMarks: 100, grade: 'A' },
        { subject: 'हिंदी (Hindi)', marks: 88, maxMarks: 100, grade: 'A' },
      ],
      totalMarks: 334,
      maxTotal: 400,
      percentage: 83.5,
      finalGrade: 'A',
      result: 'Pass',
    };
    return c.json({ success: true, reportCard: defaultCard });
  }

  return c.json({ success: true, reportCard: card });
});

export default examsApp;
