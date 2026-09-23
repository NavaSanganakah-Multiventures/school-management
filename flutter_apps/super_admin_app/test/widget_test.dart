import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vidyasetu_super_admin_app/models/plan_model.dart';
import 'package:vidyasetu_super_admin_app/models/school_model.dart';
import 'package:vidyasetu_super_admin_app/screens/super_admin_login_screen.dart';

void main() {
  testWidgets('SuperAdmin login screen renders', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: SuperAdminLoginScreen()),
    );

    expect(find.text('Pragnya Mitra Admin'), findsWidgets);
    expect(find.text('सुपर एडमिन लॉगिन'), findsOneWidget);
  });

  test('SchoolModel parses tenantToJson shape', () {
    final m = SchoolModel.fromJson({
      'id': 'school-1',
      'schoolName': 'Test School',
      'subdomain': 'test',
      'contactEmail': 'a@b.com',
      'contactPhone': '1234567890',
      'status': 'Trial',
      'registrationStatus': 'Pending_Approval',
      'planId': 'trial',
    });
    expect(m.schoolName, 'Test School');
    expect(m.isPending, isTrue);
  });

  test('PlanModel parses plan shape', () {
    final p = PlanModel.fromJson({'id': 'trial', 'name': '7-दिन फ्री ट्रायल'});
    expect(p.id, 'trial');
    expect(p.isTrial, isTrue);
  });
}