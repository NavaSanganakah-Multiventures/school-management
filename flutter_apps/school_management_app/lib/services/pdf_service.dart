import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:printing/printing.dart';

import '../models/attendance_model.dart';
import '../models/exam_model.dart';
import '../models/fee_model.dart';
import '../models/leave_model.dart';
import '../models/school_profile_model.dart';
import '../models/student_model.dart';
import '../widgets/common_widgets.dart' show showSnack;
import 'pdf_engine.dart';
import 'school_profile_service.dart';

/// Public API for generating and sharing Hindi-ready PDF documents.
///
/// Every method renders via [PdfEngine] (Flutter text engine → embedded image)
/// so Devanagari text is shaped correctly, then hands the file to the system
/// share/print sheet ([Printing.sharePdf]) — works on Android & Web.
class PdfService {
  /// Pure render entry point (no platform channels) — used by tests and
  /// callers that only need the raw PDF bytes.
  static Future<Uint8List> renderBytes(List<PdfBlock> blocks) =>
      PdfEngine.instance.renderPdf(blocks);

  /// Renders [blocks] to a PDF and opens the share/print/download sheet.
  static Future<void> saveAndShare(
    BuildContext context,
    List<PdfBlock> blocks,
    String filename,
  ) async {
    try {
      final bytes = await PdfEngine.instance.renderPdf(blocks);
      await Printing.sharePdf(bytes: bytes, filename: _safeFilename(filename));
      if (context.mounted) {
        showSnack(context, 'PDF तैयार है — सहेजें / प्रिंट करें');
      }
    } on Exception catch (e) {
      if (context.mounted) {
        showSnack(context, 'PDF नहीं बन सका ($e)', isError: true);
      }
    }
  }

  // ── Fee receipt / bill ────────────────────────────────────────────────────

  static Future<void> feeReceipt(
    BuildContext context,
    FeeInvoiceModel inv,
    SchoolProfileModel school,
  ) =>
      saveAndShare(context, feeReceiptBlocks(inv, school), 'fee-receipt-${inv.invoiceNumber ?? inv.id}');

  /// Builds the receipt/bill page blocks (pure — testable).
  static List<PdfBlock> feeReceiptBlocks(FeeInvoiceModel inv, SchoolProfileModel school) {
    final isReceipt = inv.paid > 0;
    return <PdfBlock>[
      ..._schoolHeader(school, isReceipt ? 'फीस रसीद' : 'फीस बिल'),
      PdfRow(
        [
          'रसीद संख्या: ${inv.invoiceNumber ?? inv.id}',
          'दिनांक: ${_fmtDate(inv.paidAt) ?? _fmtDate(inv.dueDate) ?? ''}',
        ],
        widths: [0.58, 0.42],
      ),
      const PdfSpacer(7),
      PdfRow(['छात्र का नाम', inv.studentName], widths: [0.3, 0.7]),
      PdfRow(
        [
          'कक्षा',
          '${inv.className ?? ''}${inv.section != null && inv.section!.isNotEmpty ? ' • ${inv.section}' : ''}',
        ],
        widths: [0.3, 0.7],
      ),
      PdfRow(['शीर्षक', inv.title], widths: [0.3, 0.7]),
      const PdfSpacer(5),
      const PdfDivider(ptBefore: 4, ptAfter: 4),
      const PdfRow(
        ['कुल राशि', 'भुगतान', 'बकाया'],
        widths: [1 / 3, 1 / 3, 1 / 3],
        bold: true,
        headerRow: true,
        ptAfter: 1,
      ),
      PdfRow(
        ['₹${_money(inv.total)}', '₹${_money(inv.paid)}', '₹${_money(inv.due)}'],
        widths: [1 / 3, 1 / 3, 1 / 3],
        ptAfter: 5,
      ),
      if (inv.paid > 0) ...[
        const PdfText('भुगतान विवरण', bold: true, size: 11, color: PdfEngine.primary, ptBefore: 6, ptAfter: 2),
        PdfRow(['भुगतान विधि', inv.paymentMethod ?? '—'], widths: [0.3, 0.7]),
        PdfRow(
          ['लेन-देन ID', (inv.transactionId ?? '').isEmpty ? '—' : inv.transactionId!],
          widths: [0.3, 0.7],
        ),
        if (inv.paidAt != null)
          PdfRow(['भुगतान तिथि', _fmtDate(inv.paidAt) ?? inv.paidAt!], widths: [0.3, 0.7]),
      ],
      PdfRow(['स्थिति', _statusHi(inv.status)], widths: [0.3, 0.7]),
      const PdfSpacer(10),
      ..._signature(),
      const PdfText(
        'यह एक कंप्यूटर जनित रसीद है।',
        size: 8.5,
        color: PdfEngine.muted,
        align: PAlign.center,
        ptBefore: 12,
      ),
    ];
  }

  // ── Report card ───────────────────────────────────────────────────────────

  static Future<void> reportCard(
    BuildContext context,
    ReportCardModel rc,
    SchoolProfileModel school,
  ) =>
      saveAndShare(context, reportCardBlocks(rc, school), 'report-card-${rc.studentName}');

  /// Builds the report card page blocks (pure — testable).
  static List<PdfBlock> reportCardBlocks(ReportCardModel rc, SchoolProfileModel school) {
    return <PdfBlock>[
      ..._schoolHeader(school, 'रिपोर्ट कार्ड'),
      PdfRow(['छात्र का नाम', rc.studentName], widths: [0.3, 0.7]),
      PdfRow(['कक्षा', rc.className], widths: [0.3, 0.7]),
      PdfRow(['परीक्षा', rc.examName ?? '—'], widths: [0.3, 0.7]),
      const PdfSpacer(7),
      const PdfRow(
        ['विषय', 'प्राप्तांक', 'पूर्णांक', 'ग्रेड'],
        widths: [0.42, 0.18, 0.18, 0.22],
        bold: true,
        headerRow: true,
        ptAfter: 1,
      ),
      if (rc.subjects.isEmpty)
        const PdfText('कोई विषय डेटा उपलब्ध नहीं', align: PAlign.center, color: PdfEngine.muted)
      else
        ...rc.subjects.map(
          (s) => PdfRow(
            [
              s.subject,
              s.marksObtained ?? '—',
              s.maxMarks?.toString() ?? '—',
              s.grade ?? '—',
            ],
            widths: [0.42, 0.18, 0.18, 0.22],
          ),
        ),
      const PdfDivider(ptBefore: 8, ptAfter: 8),
      if (rc.obtainedMarks != null || rc.totalMarks != null)
        PdfRow(['कुल अंक', '${rc.obtainedMarks ?? 0} / ${rc.totalMarks ?? 0}'], widths: [0.3, 0.7], bold: true),
      if (rc.percentage != null)
        PdfRow(['प्रतिशत', '${rc.percentage}%'], widths: [0.3, 0.7]),
      if (rc.grade != null) PdfRow(['ग्रेड', rc.grade!], widths: [0.3, 0.7]),
      const PdfSpacer(10),
      ..._signature(),
    ];
  }

  // ── Bonafide certificate ──────────────────────────────────────────────────

  static Future<void> bonafide(
    BuildContext context,
    StudentModel s,
    SchoolProfileModel school,
  ) =>
      saveAndShare(context, bonafideBlocks(s, school), 'bonafide-${s.scholarNumber.isEmpty ? s.fullName : s.scholarNumber}');

  /// Builds the bonafide certificate page blocks (pure — testable).
  static List<PdfBlock> bonafideBlocks(StudentModel s, SchoolProfileModel school) {
    final section = (s.section != null && s.section!.isNotEmpty) ? ' • ${s.section}' : '';
    return <PdfBlock>[
      ..._schoolHeader(school, 'बोनाफाइड प्रमाण पत्र'),
      const PdfSpacer(6),
      PdfText(
        'यह प्रमाणित किया जाता है कि श्री/कुमारी ${s.fullName}, '
        'पुत्र/पुत्री ${s.fatherName.isEmpty ? '—' : s.fatherName}, '
        'कक्षा ${s.className}$section में इस विद्यालय में नियमित रूप से अध्ययनरत है। '
        'उसका स्कॉलर क्रमांक ${s.scholarNumber.isEmpty ? '—' : s.scholarNumber} है।',
        size: 10.5,
        align: PAlign.justify,
        ptAfter: 10,
      ),
      PdfRow(['जन्म तिथि', s.dob ?? '—'], widths: [0.3, 0.7]),
      PdfRow(['रोल नंबर', s.rollNumber.isEmpty ? '—' : s.rollNumber], widths: [0.3, 0.7]),
      if (s.admissionDate != null)
        PdfRow(['प्रवेश तिथि', s.admissionDate!], widths: [0.3, 0.7]),
      PdfRow(['अभिभावक फ़ोन', s.parentPhone ?? '—'], widths: [0.3, 0.7]),
      if (s.currentAddress != null && s.currentAddress!.isNotEmpty)
        PdfRow(['पता', s.currentAddress!], widths: [0.3, 0.7]),
      const PdfSpacer(8),
      const PdfText(
        'यह प्रमाण पत्र विद्यार्थी की व्यक्तिगत आवश्यकताओं (पासपोर्ट, बैंक खाता आदि) हेतु जारी किया गया है।',
        size: 10,
        align: PAlign.justify,
        color: PdfEngine.muted,
        ptAfter: 8,
      ),
      const PdfSpacer(6),
      ..._signature(),
    ];
  }

  // ── Notice ────────────────────────────────────────────────────────────────

  static Future<void> notice(
    BuildContext context,
    SchoolProfileModel school, {
    required String title,
    required String content,
    required String category,
    required String priority,
    required String audience,
    required String publishedBy,
    required String publishedDate,
  }) =>
      saveAndShare(
        context,
        noticeBlocks(
          school,
          title: title,
          content: content,
          category: category,
          priority: priority,
          audience: audience,
          publishedBy: publishedBy,
          publishedDate: publishedDate,
        ),
        'notice-${_slug(title)}',
      );

  /// Builds the notice page blocks (pure — testable).
  static List<PdfBlock> noticeBlocks(
    SchoolProfileModel school, {
    required String title,
    required String content,
    required String category,
    required String priority,
    required String audience,
    required String publishedBy,
    required String publishedDate,
  }) {
    final paragraphs = content
        .split('\n')
        .where((p) => p.trim().isNotEmpty)
        .map((p) => PdfText(p.trim(), size: 10.5, align: PAlign.justify, ptAfter: 7))
        .toList();
    return <PdfBlock>[
      ..._schoolHeader(school, 'सूचना'),
      PdfRow(
        [
          'श्रेणी: $category',
          'गंभीरता: $priority',
        ],
        widths: [0.5, 0.5],
      ),
      PdfRow(
        [
          'लक्षित दर्शक: $audience',
          'दिनांक: $publishedDate',
        ],
        widths: [0.5, 0.5],
      ),
      const PdfSpacer(8),
      PdfText(title, bold: true, size: 12.5, align: PAlign.center, ptAfter: 8),
      ...paragraphs,
      if (paragraphs.isEmpty)
        const PdfText('कोई विवरण उपलब्ध नहीं', align: PAlign.center, color: PdfEngine.muted),
      const PdfSpacer(10),
      PdfRow(
        [
          'जारीकर्ता: $publishedBy',
          '',
        ],
        widths: [0.6, 0.4],
      ),
    ];
  }

  // ── Leave application ─────────────────────────────────────────────────────

  static Future<void> leaveLetter(
    BuildContext context,
    LeaveApplicationModel a,
    SchoolProfileModel school,
  ) =>
      saveAndShare(context, leaveLetterBlocks(a, school), 'leave-${a.studentName ?? a.id}');

  /// Builds the leave application letter blocks (pure — testable).
  static List<PdfBlock> leaveLetterBlocks(LeaveApplicationModel a, SchoolProfileModel school) {
    return <PdfBlock>[
      ..._schoolHeader(school, 'अवकाश आवेदन पत्र'),
      const PdfSpacer(8),
      const PdfText('सेवा में,', size: 10.5),
      const PdfText('प्राचार्य महोदय,', size: 10.5),
      PdfText(school.schoolName, size: 10.5, bold: true, ptAfter: 10),
      const PdfText('विषय: अवकाश हेतु आवेदन।', bold: true, size: 10.5, ptAfter: 8),
      PdfText(
        'महोदय, विद्यार्थी ${a.studentName?.isNotEmpty == true ? a.studentName : '—'}'
        '${a.className?.isNotEmpty == true ? ' (कक्षा ${a.className})' : ''}'
        ' को ${a.startDate} से ${a.endDate} तक विद्यालय में उपस्थित होने में असमर्थ है। '
        'कारण: ${a.reason}। अतः कृपया उपरोक्त अवधि हेतु अवकाश स्वीकृत करने की कृपा करें।',
        size: 10.5,
        align: PAlign.justify,
        ptAfter: 12,
      ),
      const PdfText('आपका आज्ञाकारी,', size: 10, align: PAlign.right, ptBefore: 6),
      PdfText(
        '${a.studentName?.isNotEmpty == true ? a.studentName : 'विद्यार्थी'}  (हस्ताक्षर)',
        size: 10,
        bold: true,
        align: PAlign.right,
        ptAfter: 10,
      ),
      PdfRow(
        [
          'स्थिति',
          _statusHi(a.status),
        ],
        widths: [0.3, 0.7],
      ),
      const PdfSpacer(8),
      ..._signature(),
    ];
  }

  // ── Daily attendance sheet ────────────────────────────────────────────────

  static Future<void> attendanceSheet(
    BuildContext context,
    List<AttendanceRecordModel> records,
    SchoolProfileModel school, {
    required String classLabel,
    required String date,
  }) =>
      saveAndShare(context, attendanceSheetBlocks(records, school, classLabel: classLabel, date: date), 'attendance-$date-$classLabel');

  /// Builds the daily attendance sheet blocks (pure — testable).
  static List<PdfBlock> attendanceSheetBlocks(
    List<AttendanceRecordModel> records,
    SchoolProfileModel school, {
    required String classLabel,
    required String date,
  }) {
    final present = records.where((r) => r.status == 'Present').length;
    final absent = records.where((r) => r.status == 'Absent').length;
    final leave = records.where((r) => r.status == 'Leave').length;
    final unmarked = records.where((r) => r.status == 'Unmarked').length;
    final rate = records.isEmpty ? 0 : ((present / records.length) * 100).round();

    return <PdfBlock>[
      ..._schoolHeader(school, 'दैनिक उपस्थिति पत्रक'),
      PdfRow(
        [
          'कक्षा: $classLabel',
          'दिनांक: $date',
        ],
        widths: [0.5, 0.5],
      ),
      const PdfSpacer(6),
      const PdfRow(
        ['क्र.', 'छात्र का नाम', 'स्कॉलर नंबर', 'स्थिति'],
        widths: [0.08, 0.44, 0.24, 0.24],
        bold: true,
        headerRow: true,
        ptAfter: 1,
      ),
      if (records.isEmpty)
        const PdfText('कोई रिकॉर्ड उपलब्ध नहीं', align: PAlign.center, color: PdfEngine.muted, ptBefore: 6)
      else
        ...records.asMap().entries.map(
              (e) => PdfRow(
                [
                  '${e.key + 1}',
                  e.value.studentName,
                  e.value.scholarNumber.isEmpty ? '—' : e.value.scholarNumber,
                  _statusHi(e.value.status),
                ],
                widths: [0.08, 0.44, 0.24, 0.24],
              ),
            ),
      const PdfDivider(ptBefore: 10, ptAfter: 8),
      const PdfRow(
        ['कुल', 'उपस्थित', 'अनुपस्थित', 'अवकाश', 'लंबित'],
        widths: [0.2, 0.2, 0.2, 0.2, 0.2],
        bold: true,
        headerRow: true,
        ptAfter: 1,
      ),
      PdfRow(
        ['${records.length}', '$present', '$absent', '$leave', '$unmarked'],
        widths: [0.2, 0.2, 0.2, 0.2, 0.2],
        ptAfter: 6,
      ),
      PdfRow(['उपस्थिति प्रतिशत', '$rate%'], widths: [0.3, 0.7], bold: true),
      const PdfSpacer(10),
      ..._signature(),
    ];
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  static SchoolProfileModel? _cachedSchool;
  static DateTime? _cachedAt;

  /// Fetches the school profile (cached for 5 minutes) for the PDF header;
  /// falls back to a neutral name if the endpoint fails.
  static Future<SchoolProfileModel> schoolProfile() async {
    if (_cachedSchool != null &&
        _cachedAt != null &&
        DateTime.now().difference(_cachedAt!) < const Duration(minutes: 5)) {
      return _cachedSchool!;
    }
    try {
      final s = await SchoolProfileService().getProfile();
      _cachedSchool = s;
      _cachedAt = DateTime.now();
      return s;
    } catch (_) {
      return SchoolProfileModel(schoolName: 'Pragnya Mitra स्कूल');
    }
  }

  static List<PdfBlock> _schoolHeader(SchoolProfileModel s, String title) {
    final address = [
      if ((s.address ?? '').isNotEmpty) s.address,
      if ((s.city ?? '').isNotEmpty) s.city,
      if ((s.state ?? '').isNotEmpty) s.state,
      if ((s.pincode ?? '').isNotEmpty) '- ${s.pincode}',
    ].join(' ');
    return [
      const PdfSpacer(8),
      PdfText(s.schoolName, size: 16.5, bold: true, align: PAlign.center),
      if (address.trim().isNotEmpty)
        PdfText(address.trim(), size: 9, color: PdfEngine.muted, align: PAlign.center),
      if (s.phone != null || s.email != null)
        PdfText(
          [
            if (s.phone != null) 'फ़ोन: ${s.phone}',
            if (s.email != null) 'ईमेल: ${s.email}',
          ].join('  •  '),
          size: 9,
          color: PdfEngine.muted,
          align: PAlign.center,
        ),
      const PdfSpacer(8),
      const PdfDivider(thickness: 1.4, color: PdfEngine.primary, ptAfter: 1.5),
      const PdfDivider(thickness: 0.5),
      if ((s.academicSession ?? '').isNotEmpty)
        PdfText('शैक्षणिक सत्र: ${s.academicSession}', size: 8.5, color: PdfEngine.muted, align: PAlign.right),
      PdfText(title, size: 13.5, bold: true, align: PAlign.center, color: PdfEngine.primary, ptBefore: 5, ptAfter: 1),
      const PdfSpacer(8),
    ];
  }

  static List<PdfBlock> _signature() {
    final today = DateFormat('dd/MM/yyyy').format(DateTime.now());
    return [
      const PdfSpacer(6),
      PdfRow(
        [
          'हस्ताक्षर (प्राचार्य)',
          'दिनांक: $today',
        ],
        widths: [0.55, 0.45],
      ),
    ];
  }

  static String _statusHi(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'भुगतान हो गया';
      case 'partial':
        return 'आंशिक भुगतान';
      case 'overdue':
        return 'बकाया';
      case 'approved':
        return 'स्वीकृत';
      case 'rejected':
        return 'अस्वीकृत';
      case 'pending':
        return 'लंबित';
      case 'present':
        return 'उपस्थित';
      case 'absent':
        return 'अनुपस्थित';
      case 'leave':
        return 'अवकाश';
      case 'unmarked':
        return 'लंबित';
      default:
        return status;
    }
  }

  static String _money(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2);

  static String? _fmtDate(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    final dt = DateTime.tryParse(iso.replaceFirst(' ', 'T'));
    if (dt == null) return iso;
    return DateFormat('dd/MM/yyyy').format(dt);
  }

  static String _safeFilename(String name) {
    var s = name
        .toLowerCase()
        .trim()
        .replaceAll(RegExp(r'[^\w\-\.]'), '-')
        .replaceAll(RegExp(r'-+'), '-');
    if (!s.endsWith('.pdf')) s = '$s.pdf';
    return s;
  }

  static String _slug(String s) => _safeFilename(s).replaceAll('.pdf', '');
}