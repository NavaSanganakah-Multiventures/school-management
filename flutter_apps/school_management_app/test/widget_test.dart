// Basic smoke test for Pragnya Mitra School Management App.
//
// Verifies the app builds and the login screen renders correctly.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pragnya/main.dart';

void main() {
  testWidgets('App renders login screen on startup', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const PragnyaMitraApp());

    // Wait for async initialization to complete.
    await tester.pumpAndSettle();

    // Verify the login screen is displayed.
    // The login screen should show the app title and login form.
    expect(find.text('Pragnya Mitra'), findsOneWidget);
    expect(find.text('School Management System'), findsOneWidget);

    // Verify login form elements exist.
    expect(find.text('सुरक्षित लॉगिन'), findsOneWidget);
    expect(find.byType(TextField), findsWidgets);
  });

  testWidgets('Login form shows email and password fields', (WidgetTester tester) async {
    await tester.pumpWidget(const PragnyaMitraApp());
    await tester.pumpAndSettle();

    // Verify email/username field exists.
    expect(find.text('ईमेल / यूज़रनेम'), findsOneWidget);

    // Verify password field exists.
    expect(find.text('पासवर्ड'), findsOneWidget);

    // Verify login button exists.
    expect(find.text('पोर्टल में प्रवेश करें'), findsOneWidget);
  });
}
