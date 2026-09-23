import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:pragnya/models/attendance_model.dart';
import 'package:pragnya/models/exam_model.dart';
import 'package:pragnya/models/fee_model.dart';
import 'package:pragnya/models/leave_model.dart';
import 'package:pragnya/models/school_profile_model.dart';
import 'package:pragnya/models/student_model.dart';
import 'package:pragnya/services/pdf_engine.dart';
import 'package:pragnya/services/pdf_service.dart';

/// Verifies the image-backed PDF pipeline produces valid, multi-page PDFs
/// with Hindi (Devanagari) content for every document type.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final school = SchoolProfileModel(
    schoolName: 'आदर्श विद्यालय',
    address: 'पटेल नगर, मुख्य मार्ग',
    city: 'लखनऊ',
    state: 'उत्तर प्रदेश',
    pincode: '226001',
    phone: '0522-1234567',
    email: 'info@adarshschool.example',
    academicSession: '2026-27',
  );

  final student = StudentModel(
    id: 's1',
    scholarNumber: '2026-001',
    rollNumber: '12',
    fullName: 'राहुल कुमार',
    fatherName: 'रमेश कुमार',
    motherName: 'सुनीता देवी',
    className: 'कक्षा 10',
    section: 'A',
    dob: '2011-05-14',
    gender: 'पुरुष',
    parentPhone: '9876543210',
    currentAddress: 'गांव - रामपुर, लखनऊ',
    admissionDate: '2020-04-01',
    status: 'active',
  );

  final invoice = FeeInvoiceModel(
    id: 'inv1',
    invoiceNumber: 'F-2026-1042',
    studentName: 'राहुल कुमार',
    scholarNumber: '2026-001',
    className: 'कक्षा 10',
    section: 'A',
    title: 'मासिक फीस - जनवरी 2026',
    totalAmount: '2500',
    paidAmount: '2500',
    dueDate: '2026-01-15',
    status: 'paid',
    paymentMethod: 'UPI',
    transactionId: 'TXN123456789',
    paidAt: '2026-01-10',
  );

  final rc = ReportCardModel(
    studentName: 'राहुल कुमार',
    className: 'कक्षा 10',
    examName: 'वार्षिक परीक्षा 2026',
    subjects: [
      SubjectMarkModel(subject: 'हिंदी', marksObtained: '78', maxMarks: 100, grade: 'A'),
      SubjectMarkModel(subject: 'गणित', marksObtained: '85', maxMarks: 100, grade: 'A+'),
      SubjectMarkModel(subject: 'विज्ञान', marksObtained: '72', maxMarks: 100, grade: 'B+'),
      SubjectMarkModel(subject: 'अंग्रेज़ी', marksObtained: '65', maxMarks: 100, grade: 'B'),
    ],
    totalMarks: 400,
    obtainedMarks: 300,
    percentage: '75',
    grade: 'B+',
  );

  final leave = LeaveApplicationModel(
    id: 'lv1',
    studentId: 's1',
    studentName: 'राहुल कुमार',
    className: 'कक्षा 10',
    startDate: '2026-06-02',
    endDate: '2026-06-05',
    reason: 'पारिवारिक कार्यक्रम (विवाह) में भाग लेने हेतु',
    status: 'approved',
  );

  List<AttendanceRecordModel> records(int n) => List.generate(
        n,
        (i) => AttendanceRecordModel(
          id: 'a$i',
          studentId: 's$i',
          studentName: 'विद्यार्थी ${i + 1}',
          scholarNumber: '2026-${(1000 + i)}',
          className: 'कक्षा 10',
          section: 'A',
          parentName: 'अभिभावक',
          parentPhone: '9876543210',
          date: '2026-09-01',
          status: i.isEven ? 'Present' : (i % 3 == 1 ? 'Absent' : 'Leave'),
          isMarked: true,
          remarks: '',
          markedBy: 'श्रीमती शर्मा',
        ),
      );

  int pageCount(List<int> bytes) {
    final text = latin1.decode(bytes);
    final m = RegExp(r'/Count (\d+)').firstMatch(text);
    return m == null ? 0 : int.parse(m.group(1)!);
  }

  Future<void> expectValidPdf(List<dynamic> blocks, {required int minPages}) async {
    final bytes = await PdfService.renderBytes(blocks.cast());
    expect(PdfEngine.instance.fontsLoaded, isTrue,
        reason: 'Hind fonts must load from assets/fonts (assets: in pubspec)');
    expect(bytes, isNotEmpty, reason: 'PDF bytes should not be empty');
    expect(latin1.decode(bytes.sublist(0, 5)), '%PDF-', reason: 'must start with %PDF-');
    expect(bytes.length, greaterThan(10000), reason: 'image-backed PDF should be substantial');
    expect(pageCount(bytes), greaterThanOrEqualTo(minPages), reason: 'page count');
  }

  test('fee receipt PDF renders with Hindi text', () async {
    await expectValidPdf(
      PdfService.feeReceiptBlocks(invoice, school),
      minPages: 1,
    );
  });

  test('report card PDF renders with subject table', () async {
    await expectValidPdf(
      PdfService.reportCardBlocks(rc, school),
      minPages: 1,
    );
  });

  test('bonafide certificate PDF renders', () async {
    await expectValidPdf(
      PdfService.bonafideBlocks(student, school),
      minPages: 1,
    );
  });

  test('notice PDF renders multi-line Hindi content', () async {
    await expectValidPdf(
      PdfService.noticeBlocks(
        school,
        title: 'वार्षिक खेलकूद प्रतियोगिता',
        content: 'सभी विद्यार्थियों को सूचित किया जाता है कि विद्यालय की वार्षिक खेलकूद प्रतियोगिता आगामी 15 अक्टूबर से शुरू होगी।\n\nइच्छुक विद्यार्थी अपने कक्षा अध्यापक से नामांकन कराएं। खेलकूद सामग्री का वितरण विद्यालय द्वारा किया जाएगा।',
        category: 'आयोजन',
        priority: 'सामान्य',
        audience: 'सभी विद्यार्थी',
        publishedBy: 'प्राचार्य',
        publishedDate: '2026-09-20',
      ),
      minPages: 1,
    );
  });

  test('leave application PDF renders letter format', () async {
    await expectValidPdf(
      PdfService.leaveLetterBlocks(leave, school),
      minPages: 1,
    );
  });

  test('attendance sheet single page under limit', () async {
    await expectValidPdf(
      PdfService.attendanceSheetBlocks(records(20), school, classLabel: 'कक्षा 10', date: '2026-09-01'),
      minPages: 1,
    );
  });

  test('attendance sheet paginates to multiple pages for large classes', () async {
    await expectValidPdf(
      PdfService.attendanceSheetBlocks(records(90), school, classLabel: 'कक्षा 10', date: '2026-09-01'),
      minPages: 2,
    );
  });

  test('unpaid invoice renders as fee bill', () async {
    final unpaid = FeeInvoiceModel(
      id: 'inv2',
      invoiceNumber: 'F-2026-1043',
      studentName: 'अंजलि शर्मा',
      className: 'कक्षा 9',
      title: 'मासिक फीस - फरवरी 2026',
      totalAmount: '2200',
      paidAmount: '0',
      status: 'unpaid',
    );
    await expectValidPdf(
      PdfService.feeReceiptBlocks(unpaid, school),
      minPages: 1,
    );
  });
}