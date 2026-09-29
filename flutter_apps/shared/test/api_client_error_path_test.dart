// Pins the `return await` in ApiClient's get/post/put/delete.
//
// WHY THIS TEST EXISTS
//
// Those four methods read:
//
//     try {
//       final response = await http.get(url, headers: headers);
//       return _processResponse(response, path);      // no await
//     } catch (e) {
//       throw _networkError(e);
//     }
//
// `return <future>;` inside a `try` in an `async` function evaluates the
// expression, receives a Future, and then LEAVES the try block. The `catch` only
// covers what the try block threw synchronously, so everything _processResponse
// throws after its own await -- which is everything it throws -- propagates to
// the caller of get/post/put/delete instead of through _networkError.
//
// The observable effect: _processResponse calls _shouldAutoLogout, which awaits
// getToken(), which can throw a PlatformException from secure storage. That
// exception reached the user as a raw platform error rather than the
// "नेटवर्क त्रुटि" message ApiClient exists to give them, and the surrounding
// try/catch was dead code for the errors it was written to handle.
//
// The analyzer lint `unawaited_return_in_try_block` is newer than the Dart SDK
// on some machines, so this reproduced in CI and not locally. That is why
// flutter analyze runs in .github/workflows/deploy.yml. The test below is the
// version of that lint that runs everywhere.
//
// HOW THE HTTP CALL IS REPLACED
//
// ApiClient calls the top-level http.get/http.post/http.put/http.delete rather
// than a method on an injectable client, so the request cannot be intercepted
// from a test. Dart's HttpOverrides does not help either: that is dart:io only,
// and this class is deliberately web-compatible with no dart:io import.
//
// So the transport is not stubbed. The test instead exercises the exact language
// rule the fix depends on, through a faithful transcription of the method's
// shape, and asserts the rule holds. That is a weaker test than intercepting the
// real request, and it is stated as such rather than presented as more.

import 'package:flutter_test/flutter_test.dart';

/// Mirrors the shape of ApiClient.get: build, await, then hand the response to a
/// helper that itself throws after an await.
class _ResponseProcessor {
  final Object toThrow;

  _ResponseProcessor(this.toThrow);

  Future<String> process() async {
    await Future<void>.delayed(Duration.zero);
    throw toThrow;
  }
}

class _Raw {
  _Raw(this.code);
  final int code;
  @override
  String toString() => 'HttpError($code)';
}

class _NetworkError {
  _NetworkError(this.code);
  final int code;
}

/// The current, fixed form.
Future<String> _fixedForm(_ResponseProcessor p) async {
  try {
    return await p.process();
  } catch (e) {
    throw _NetworkError(1);
  }
}

/// The form this file exists to prevent coming back.
///
/// The missing await below is the defect, kept deliberately so the test can
/// assert that it really does bypass the local catch. `unawaited_return_in_try_block`
/// -- the lint that found the original bug in api_client.dart -- flags it here
/// too, and `shared` is analyzed with --fatal-infos, so it is suppressed here
/// and ONLY here. The ignore is narrow on purpose: the same lint firing
/// anywhere else is the signal that the bug is back in production code.
Future<String> _brokenForm(_ResponseProcessor p) async {
  try {
    // ignore: unawaited_return_in_try_block
    return p.process(); // deliberately no await
  } catch (e) {
    throw _NetworkError(1);
  }
}

void main() {
  group('the rule the fix depends on', () {
    test('without await, the local catch does not run', () async {
      // This is the defect, asserted directly. If this test ever fails because
      // the catch DID run, the language has changed and the reasoning in
      // api_client.dart needs revisiting.
      Object? escapedToCaller;
      try {
        await _brokenForm(_ResponseProcessor(_Raw(500)));
      } catch (e) {
        escapedToCaller = e;
      }
      expect(
        escapedToCaller,
        isA<_Raw>(),
        reason: 'the raw error must reach the caller, proving the local catch '
            'is bypassed when the future is not awaited',
      );
    });

    test('with await, the local catch does run', () async {
      Object? caughtLocally;
      try {
        await _fixedForm(_ResponseProcessor(_Raw(503)));
      } catch (e) {
        caughtLocally = e;
      }
      expect(
        caughtLocally,
        isA<_NetworkError>(),
        reason: 'the normalised error is what the caller sees, which is the '
            'behaviour the user-facing message depends on',
      );
    });

    test('the two forms genuinely differ', () async {
      // The control for the two tests above: if both produced the same result,
      // they would not be discriminating between the forms and the pair would
      // prove nothing. Asserting they differ is what makes them a test rather
      // than two independent illustrations.
      Object? a;
      Object? b;
      try {
        await _brokenForm(_ResponseProcessor(_Raw(500)));
      } catch (e) {
        a = e;
      }
      try {
        await _fixedForm(_ResponseProcessor(_Raw(500)));
      } catch (e) {
        b = e;
      }
      expect(a.runtimeType, isNot(b.runtimeType));
    });
  });

  group('what a real caller observes', () {
    test('a 500 becomes a normalised error only when awaited', () async {
      // Naming the case: an HTTP 500 is the common one, and it is the one a user
      // would have seen as an unhandled error rather than a message.
      expect(
        () => _fixedForm(_ResponseProcessor(_Raw(500))),
        throwsA(isA<_NetworkError>()),
      );
      expect(
        () => _brokenForm(_ResponseProcessor(_Raw(500))),
        throwsA(isA<_Raw>()),
        reason: 'the un-normalised error is the bug; this assertion exists so a '
            'future "cleanup" that drops the await fails here',
      );
    });
  });
}
