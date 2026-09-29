// Widget tests for the school-action dialogs in the Super Admin console.
//
// WHY THESE EXIST
//
// Seven of these dialogs discarded their result: both buttons called
// Navigator.pop() with no value and the follow-up action ran unconditionally. So
// tapping "रद्द करें" approved a pending school, overwrote the school record,
// changed the billing plan, replaced the sender config, sent a payment-link
// email plus an FCM push, push-notified an entire school, and triggered a CI
// deploy workflow. The last one is why this file is not cosmetic.
//
// scripts/verify-flutter-dialogs.mjs is a source-shape check: it proves the guard
// is present in the source, and it runs in `npm test` on every pull request.
// It cannot tell whether the widget actually behaves that way. That is what these
// do -- they pump the real dialog, tap the real Cancel button, and assert the
// service was never called.
//
// THE CONTROL CASE MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS REPO
//
// A dialog that never called the service at all would pass every "Cancel did
// nothing" assertion below, and would ship a console where no button works. So
// every negative test has a matching positive one: Cancel calls nothing, Confirm
// calls exactly the expected one call. The positives are the tests that would
// fail if the fix had been done by simply deleting the action.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
// Package-qualified, matching test/widget_test.dart. Relative imports of lib/ from
// test/ resolve to a DIFFERENT library instance, so the top-level functions the
// dialogs live in are simply not in scope -- which is why `dart analyze` reported
// "confirmDialog isn't defined" rather than anything about the dialogs themselves.
import 'package:vidyasetu_super_admin_app/models/school_model.dart';
import 'package:vidyasetu_super_admin_app/screens/school_actions.dart';
import 'package:vidyasetu_super_admin_app/services/school_service.dart';
import 'package:vidyasetu_super_admin_app/widgets/app_ui.dart';

/// A SchoolService that records calls instead of making them.
///
/// Subclasses the real class so no signature changes are needed for the sake of a
/// test. Every method the dialogs call is overridden; the base implementations
/// are never reached because nothing here performs I/O.
class _RecordingService extends SchoolService {
  final List<String> calls = <String>[];

  @override
  Future<Map<String, dynamic>> approveSchool(
    String schoolId, {
    String? planId,
    String? trialEndsAt,
  }) async {
    calls.add('approveSchool');
    return {'success': true, 'message': 'approved'};
  }

  @override
  Future<Map<String, dynamic>> updateSchool(
      String schoolId, Map<String, dynamic> fields) async {
    calls.add('updateSchool');
    return {'success': true, 'message': 'updated'};
  }

  @override
  Future<Map<String, dynamic>> changePlan(
    String schoolId,
    String planId, {
    String? trialEndsAt,
  }) async {
    calls.add('changePlan');
    return {'success': true, 'message': 'plan changed'};
  }

  @override
  Future<Map<String, dynamic>> saveEmailConfig({
    required String schoolId,
    String? limit,
    String fromName = '',
    String fromEmail = '',
    String replyTo = '',
    bool isActive = true,
  }) async {
    calls.add('saveEmailConfig');
    return {'success': true, 'message': 'saved'};
  }

  @override
  Future<Map<String, dynamic>> sendPaymentLink({
    required String schoolId,
    required String planId,
    String billingCycle = 'annual',
  }) async {
    calls.add('sendPaymentLink');
    return {'success': true, 'message': 'sent'};
  }

  @override
  Future<Map<String, dynamic>> notifySchool({
    required String schoolId,
    required String title,
    required String body,
    String targetRole = 'Director',
    String priority = 'Normal',
    String actionUrl = '',
  }) async {
    calls.add('notifySchool');
    return {'success': true, 'message': 'notified'};
  }

  @override
  Future<Map<String, dynamic>> provisionSchool(String schoolId,
      {String? slug, String? domain}) async {
    calls.add('provisionSchool');
    return {'success': true, 'message': 'provisioning'};
  }
}

// SchoolModel has 21 required fields, all named. Listing them is noise, but a
// missing one is a compile error rather than a silent default -- which is the
// point: a new required field upstream breaks this loudly instead of leaving a
// test that quietly exercises nothing.
const SchoolModel _school = SchoolModel(
      id: 'school-1',
      schoolName: 'Test School',
      subdomain: 'test',
      customDomain: '',
      contactEmail: 'admin@test.school',
      contactPhone: '+910000000000',
      status: 'Active',
      registrationStatus: 'Approved',
      planId: 'trial',
      planName: 'Trial',
      trialEndsAt: '',
      // Non-nullable String on every one of these, not String?. An empty string is
      // the "not set" value; passing null is a type error, which is what dart
      // analyze caught when this was first written.
      deletedAt: '',
      createdAt: '2026-01-01',
      provisioningStatus: 'live',
      dedicatedSlug: 'test',
      dedicatedDomain: 'test.pragnya.nasven.com',
      d1DatabaseId: '',
      r2BucketName: '',
      kvNamespaceId: '',
      provisionedAt: '',
      provisioningError: '',
    );

/// Opens a dialog and returns with it still open, ready to be tapped.
///
/// WHY THIS DOES NOT AWAIT THE DIALOG
///
/// A first draft awaited the dialog's future before returning. That deadlocks:
/// the dialog's future only completes when the dialog closes, and the dialog only
/// closes when the test taps a button -- which the test cannot do because this
/// helper has not returned. Both dialog tests hung until the harness's ten-minute
/// timeout, which is a slow way to learn that `done.future` is the wrong thing to
/// wait on here.
///
/// So this opens the dialog, settles, and returns. The caller taps, settles, and
/// then asserts; `_settle` at the end covers the async gap between the tap and
/// the service call the tap triggers.
Future<void> _openDialog(
  WidgetTester tester,
  Future<void> Function(BuildContext) open,
) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Builder(builder: (context) {
        // Not awaited: the dialog stays open, which is the point.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          open(context).catchError((Object e) => debugPrint('dialog error: $e'));
        });
        return const SizedBox.shrink();
      }),
    ),
  ));
  // pumpAndSettle, not pump: the dialog animates in, and a single pump can leave
  // it mid-transition, where a button is not yet hit-testable.
  await tester.pumpAndSettle();
}

/// Pumps frames until [predicate] holds, or gives up after a bound.
///
/// WHY NOT A FIXED NUMBER OF PUMPS
///
/// Confirming a dialog runs _busy, which shows a progress dialog, awaits the
/// service call, pops, and then shows a SnackBar. That is several frames of work
/// whose exact count depends on how many microtasks the call took. A fixed pump
/// count is a race: too few and the assertion runs before the call lands, and the
/// "confirm must call the service" control fails for a reason that has nothing to
/// do with the code under test.
///
/// pumpAndSettle is no better here: the SnackBar animates for seconds afterwards,
/// so it would wait out a timer that is not part of what is being asserted.
///
/// So this pumps until the thing being asserted is observably true, with a bound
/// so a genuine failure still terminates.
Future<void> _pumpUntil(
  WidgetTester tester,
  bool Function() predicate, {
  int maxFrames = 60,
  String description = 'condition',
}) async {
  for (var i = 0; i < maxFrames; i++) {
    if (predicate()) return;
    await tester.pump(const Duration(milliseconds: 20));
  }
  if (!predicate()) {
    fail('$description did not become true within $maxFrames frames');
  }
}

/// Settles just enough for a "nothing happened" assertion: the guard runs, and if
/// it were wrong the call would already be visible.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 20));
  }
}

/// Finds a button by its label.
///
/// `find.text`, not `find.widgetWithText(Text, label)`. The latter looks for a
/// `Text` that has another `Text` among its DESCENDANTS, which a plain
/// `Text('रद्द करें')` does not have -- its data is on the Text itself. Every test
/// here failed with "Found 0 widgets with type Text that are ancestors of..."
/// before this changed, and the existing test/widget_test.dart in this repo uses
/// find.text for the same reason.
Finder _btn(String label) => find.text(label);

/// Asserts a button is on screen, and if it is not, says what IS on screen.
///
/// Two earlier CI failures here were both "found 0 widgets", with nothing in the
/// log saying why. This turns the next one into a diagnosis instead of a guess:
/// the failure message lists every Text currently rendered.
Future<void> _expectButton(WidgetTester tester, String label) async {
  final found = _btn(label);
  if (found.evaluate().isNotEmpty) return;
  final visible = tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '')
      .where((s) => s.isNotEmpty)
      .toList();
  fail('no button labelled "$label" on screen. Visible text: $visible');
}

/// A surface large enough that a dialog's action row is not pushed off the bottom.
///
/// The default 800x600 test window put the confirm row outside the hit-test area,
/// which surfaced as a WidgetController.getCenter error rather than a readable
/// assertion. Not an app bug -- real phones are taller -- but the tests have to
/// model a phone.
void _usePhoneSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

void main() {
  group('confirmDialog', () {
    testWidgets('cancelling reports false', (tester) async {
      bool? result;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) {
            return TextButton(
              onPressed: () async {
                result = await confirmDialog(context,
                    title: 'शीर्षक', message: 'संदेश');
              },
              child: const Text('open'),
            );
          }),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(_btn('रद्द करें'));
      await tester.pumpAndSettle();
      expect(result, isFalse);
    });

    testWidgets('confirming reports true', (tester) async {
      bool? result;
      // A larger surface: the default 800x600 test window puts the dialog's action
      // row near the bottom, and a tap there hit-tests against nothing. That is a
      // test-harness geometry problem, not an app bug, and it produced a
      // WidgetController.getCenter failure rather than a readable assertion.
      _usePhoneSurface(tester);

      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) {
            return TextButton(
              onPressed: () async {
                result = await confirmDialog(context,
                    title: 'शीर्षक', message: 'संदेश');
              },
              child: const Text('open'),
            );
          }),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(_btn('पुष्टि करें'));
      await tester.pumpAndSettle();
      expect(result, isTrue);
    });

    testWidgets('a barrier dismissal is not a confirmation', (tester) async {
      // A dismissed dialog returns null. `result == true` has to treat that as
      // "no", and a `if (result)` would not. This is the case a "dismissed means
      // cancel by default" bug hides in.
      bool? result;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) {
            return TextButton(
              onPressed: () async {
                result = await confirmDialog(context,
                    title: 'शीर्षक', message: 'संदेश');
              },
              child: const Text('open'),
            );
          }),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(10, 10)); // outside the dialog
      await tester.pumpAndSettle();
      expect(result, isNot(true));
    });
  });

  group('school action dialogs', () {
    // The two dialogs that need no network call before opening, so the test does
    // not have to stub a plan list or a provisioning check first. The other five
    // fetch before they render, which is why the source audit covers those: it
    // asserts the guard is present without needing the dialog to open.

    testWidgets('provision: cancel does NOT trigger a deploy, confirm does',
        (tester) async {
      _usePhoneSurface(tester);
      final service = _RecordingService();
      const school = _school;

      // --- cancel ---
      await _openDialog(tester,
          (context) => showProvisionDialog(context, school, service, () {}));
      // Assert the dialog really opened before concluding anything from an empty
      // call list. A dialog that failed to open looks exactly like a correct
      // cancel, and that is the failure mode this control exists to catch.
      await _expectButton(tester, 'प्रोविज़न शुरू करें');
      await _expectButton(tester, 'रद्द करें');
      await tester.tap(_btn('रद्द करें'));
      await _settle(tester);
      expect(service.calls, isEmpty,
          reason: 'cancelling must not trigger a CI deploy workflow');

      // --- confirm: the control case ---
      await _openDialog(tester,
          (context) => showProvisionDialog(context, school, service, () {}));
      await _expectButton(tester, 'प्रोविज़न शुरू करें');
      await tester.tap(_btn('प्रोविज़न शुरू करें'));
      await _pumpUntil(tester, () => service.calls.contains('provisionSchool'),
          description: 'provisionSchool to be called after confirming');
      expect(service.calls, contains('provisionSchool'),
          reason: 'confirming must actually provision, or the fix was a deletion');
    });

    testWidgets('notify: cancel does NOT notify the school, confirm does',
        (tester) async {
      _usePhoneSurface(tester);
      final service = _RecordingService();
      const school = _school;

      // --- cancel ---
      await _openDialog(tester,
          (context) => showNotifyDialog(context, school, service, () {}));
      await _expectButton(tester, 'भेजें');
      await tester.tap(_btn('रद्द करें'));
      await _settle(tester);
      expect(service.calls, isEmpty,
          reason: 'cancelling must not push-notify a whole school');

      // --- confirm: the control case ---
      await _openDialog(tester,
          (context) => showNotifyDialog(context, school, service, () {}));

      // The send button validates its own fields and CLOSES the dialog on empty
      // input, so confirming a blank form proves nothing about the guard -- the
      // dialog is gone either way. That path was never at risk, and the reason is
      // the validation rather than the result binding. Both are asserted.
      // By index rather than by label: the hint lives inside a TextField's
      // decoration, not a sibling Text, so a label-based finder is fragile. The
      // dialog has exactly two TextFields, title then body.
      await tester.enterText(find.byType(TextField).at(0), 'सूचना');
      await tester.enterText(find.byType(TextField).at(1), 'विषय');
      await tester.pumpAndSettle();

      await tester.tap(_btn('भेजें'));
      await _pumpUntil(tester, () => service.calls.contains('notifySchool'),
          description: 'notifySchool to be called after confirming');
      expect(service.calls, contains('notifySchool'),
          reason: 'confirming must actually notify, or the fix was a deletion');
    });

    testWidgets('notify: a blank form is refused without notifying', (tester) async {
      _usePhoneSurface(tester);
      final service = _RecordingService();
      const school = _school;

      await _openDialog(tester,
          (context) => showNotifyDialog(context, school, service, () {}));
      await _expectButton(tester, 'भेजें');
      await tester.tap(_btn('भेजें'));
      await _settle(tester);
      expect(service.calls, isEmpty,
          reason: 'an empty notification must not be sent');
    });
  });
}
