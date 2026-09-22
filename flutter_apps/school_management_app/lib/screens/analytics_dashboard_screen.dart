import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../models/exam_model.dart';
import '../services/exam_service.dart';
import '../widgets/common_widgets.dart';

/// Analytics dashboard screen — mirrors React analytics-dashboard.tsx.
/// Shows exam performance analytics with KPI cards, subject-wise analysis,
/// and grade distribution.
class AnalyticsDashboardScreen extends StatefulWidget {
  final UserModel user;
  const AnalyticsDashboardScreen({super.key, required this.user});

  @override
  State<AnalyticsDashboardScreen> createState() => _AnalyticsDashboardScreenState();
}

class _AnalyticsDashboardScreenState extends State<AnalyticsDashboardScreen> {
  final _svc = ExamService();

  List<ExamModel> _exams = [];
  String? _selectedExamId;
  ExamAnalyticsModel? _analytics;
  bool _loadingExams = true;
  bool _loadingAnalytics = false;

  @override
  void initState() {
    super.initState();
    _loadExams();
  }

  Future<void> _loadExams() async {
    setState(() => _loadingExams = true);
    try {
      _exams = await _svc.getExams();
      if (_exams.isNotEmpty && _selectedExamId == null) {
        _selectedExamId = _exams.first.id;
        _loadAnalytics();
      }
    } catch (_) {
      if (mounted) showSnack(context, 'परीक्षा लोड नहीं हो सकीं', isError: true);
    } finally {
      if (mounted) setState(() => _loadingExams = false);
    }
  }

  Future<void> _loadAnalytics() async {
    if (_selectedExamId == null) return;
    setState(() => _loadingAnalytics = true);
    try {
      _analytics = await _svc.getAnalytics(_selectedExamId!);
    } catch (_) {
      if (mounted) showSnack(context, 'एनालिटिक्स लोड नहीं हो सके', isError: true);
    } finally {
      if (mounted) setState(() => _loadingAnalytics = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('एनालिटिक्स डैशबोर्ड')),
      body: _loadingExams
          ? const LoadingView()
          : _exams.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.bar_chart_rounded, size: 56, color: Colors.grey.shade300),
                        const SizedBox(height: 12),
                        const Text('कोई परीक्षा नहीं मिली', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 6),
                        Text('एनालिटिक्स देखने के लिए पहले परीक्षा बनाएं।', style: TextStyle(color: Colors.grey.shade500, fontSize: 13)),
                      ],
                    ),
                  ),
                )
              : _buildContent(),
    );
  }

  Widget _buildContent() {
    final analytics = _analytics;
    return Column(
      children: [
        // Exam selector
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          color: Colors.white,
          child: Row(
            children: [
              const Icon(Icons.assignment_turned_in_rounded, size: 18, color: Colors.blue),
              const SizedBox(width: 8),
              const Text('परीक्षा:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _selectedExamId,
                  isDense: true,
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    isDense: true,
                  ),
                  style: const TextStyle(fontSize: 12),
                  items: _exams
                      .map((e) => DropdownMenuItem(
                            value: e.id,
                            child: Text('${e.name} (${e.academicYear ?? '2026-27'})', overflow: TextOverflow.ellipsis),
                          ))
                      .toList(),
                  onChanged: (v) {
                    setState(() => _selectedExamId = v);
                    _loadAnalytics();
                  },
                ),
              ),
            ],
          ),
        ),

        // Analytics body
        Expanded(
          child: _loadingAnalytics
              ? const LoadingView()
              : analytics == null
                  ? Center(
                      child: Text(
                        'परीक्षा चुनें और एनालिटिक्स देखें',
                        style: TextStyle(color: Colors.grey.shade500),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadAnalytics,
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // KPI cards
                            _buildKpiGrid(analytics),
                            const SizedBox(height: 16),

                            // Subject-wise analysis
                            if (analytics.subjectWiseAnalysis.isNotEmpty) ...[
                              _sectionHeader('विषयवार विश्लेषण', Icons.subject),
                              const SizedBox(height: 8),
                              _buildSubjectTable(analytics),
                              const SizedBox(height: 16),
                            ],

                            // Grade distribution
                            if (analytics.gradeDistribution.isNotEmpty) ...[
                              _sectionHeader('ग्रेड वितरण', Icons.pie_chart_rounded),
                              const SizedBox(height: 8),
                              _buildGradeDistribution(analytics),
                              const SizedBox(height: 16),
                            ],

                            // Performance summary
                            _sectionHeader('प्रदर्शन सारांश', Icons.insights_rounded),
                            const SizedBox(height: 8),
                            _buildPerformanceSummary(analytics),
                          ],
                        ),
                      ),
                    ),
        ),
      ],
    );
  }

  // ==================== KPI Grid ====================
  Widget _buildKpiGrid(ExamAnalyticsModel a) {
    final total = a.totalStudents;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: [
        KpiCard(label: 'कुल छात्र', value: '$total', icon: Icons.people_rounded, color: Colors.blue),
        KpiCard(label: 'पास %', value: '${a.passPercentage ?? 0}%', icon: Icons.check_circle_rounded, color: Colors.green),
        KpiCard(label: 'औसत %', value: '${a.averagePercentage ?? 0}%', icon: Icons.trending_up_rounded, color: Colors.amber),
        KpiCard(label: 'सर्वोच्च %', value: '${a.highestPercentage ?? 0}%', icon: Icons.emoji_events_rounded, color: Colors.purple),
      ],
    );
  }

  // ==================== Subject Table ====================
  Widget _buildSubjectTable(ExamAnalyticsModel a) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: WidgetStateProperty.all(Colors.grey.shade50),
          columns: const [
            DataColumn(label: Text('विषय', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11))),
            DataColumn(label: Text('औसत अंक', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)), numeric: true),
            DataColumn(label: Text('अधिकतम', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)), numeric: true),
            DataColumn(label: Text('पास %', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)), numeric: true),
            DataColumn(label: Text('उच्चतम', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)), numeric: true),
            DataColumn(label: Text('न्यूनतम', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)), numeric: true),
          ],
          rows: a.subjectWiseAnalysis.map((s) {
            return DataRow(cells: [
              DataCell(Text(s['subject']?.toString() ?? '', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600))),
              DataCell(Text('${s['averageMarks'] ?? 0}', style: const TextStyle(fontSize: 11))),
              DataCell(Text('${s['maxMarks'] ?? 0}', style: const TextStyle(fontSize: 11))),
              DataCell(Text('${s['passPercentage'] ?? 0}%', style: const TextStyle(fontSize: 11))),
              DataCell(Text('${s['highestMarks'] ?? 0}', style: const TextStyle(fontSize: 11))),
              DataCell(Text('${s['lowestMarks'] ?? 0}', style: const TextStyle(fontSize: 11))),
            ]);
          }).toList(),
        ),
      ),
    );
  }

  // ==================== Grade Distribution ====================
  Widget _buildGradeDistribution(ExamAnalyticsModel a) {
    final total = a.totalStudents > 0 ? a.totalStudents : 1;
    final colors = [
      Colors.purple,
      Colors.blue,
      Colors.green,
      Colors.amber,
      Colors.orange,
      Colors.red,
    ];
    final defaultGrades = [
      {'range': '90-100%', 'label': 'A+ (Outstanding)'},
      {'range': '75-89%', 'label': 'A (Excellent)'},
      {'range': '60-74%', 'label': 'B+ (Good)'},
      {'range': '45-59%', 'label': 'B (Satisfactory)'},
      {'range': '33-44%', 'label': 'C (Pass)'},
      {'range': 'Below 33%', 'label': 'D (Fail)'},
    ];

    final grades = a.gradeDistribution.isNotEmpty ? a.gradeDistribution : defaultGrades;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: grades.asMap().entries.map((entry) {
            final idx = entry.key;
            final g = entry.value;
            final count = g['count'] is int ? g['count'] as int : int.tryParse('${g['count'] ?? 0}') ?? 0;
            final pct = ((count / total) * 100).round();
            final label = g['label']?.toString() ?? defaultGrades[idx]['label'] ?? '';
            final color = colors[idx % colors.length];

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                      const SizedBox(width: 8),
                      Expanded(child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500))),
                      Text('$count', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      const SizedBox(width: 4),
                      Text('($pct%)', style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: count / total,
                      minHeight: 6,
                      backgroundColor: Colors.grey.shade100,
                      valueColor: AlwaysStoppedAnimation(color),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  // ==================== Performance Summary ====================
  Widget _buildPerformanceSummary(ExamAnalyticsModel a) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            _summaryRow('पास दर', '${a.passPercentage ?? 0}%', Icons.check_circle_rounded, Colors.green),
            _summaryRow('औसत स्कोर', '${a.averagePercentage ?? 0}%', Icons.trending_up_rounded, Colors.blue),
            _summaryRow('सर्वोच्च स्कोर', '${a.highestPercentage ?? 0}%', Icons.emoji_events_rounded, Colors.purple),
            _summaryRow('न्यूनतम स्कोर', '${a.lowestPercentage ?? 0}%', Icons.trending_down_rounded, Colors.orange),
            const Divider(),
            _summaryRow('पास: ${a.studentsPassed}', 'अनुत्तीर्ण: ${a.totalStudents - a.studentsPassed}', Icons.people_rounded, Colors.grey),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value, IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 12))),
          Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }

  Widget _sectionHeader(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.blue.shade700),
        const SizedBox(width: 6),
        Text(title, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.blue.shade900)),
      ],
    );
  }
}
