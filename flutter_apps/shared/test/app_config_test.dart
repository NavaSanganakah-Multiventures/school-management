// Tests for AppConfig, the multi-tenant base-URL resolver in the shared package.
//
// WHY THIS FILE EXISTS
//
// flutter_apps/shared is imported by BOTH apps and, until this commit, had no
// test/ directory and no analysis_options.yaml. It holds the code that decides
// which host every API request goes to.
//
// THE FAILURE THIS IS PINNED AGAINST
//
// getActiveBaseUrl's own doc comment records a production incident, and the fix
// lives in this file's subject:
//
//   This function used to skip [the origin branch] and return the hardcoded
//   apex. The app was therefore served from yagyaashram.pragnya.nasven.com while
//   every request went to pragnya.nasven.com. The apex has no
//   IS_DEDICATED_WORKER, so it ran the platform-tier branch of the login handler,
//   which answers 403 USE_DEDICATED_DOMAIN. The app surfaced that message
//   verbatim, it told the user to open the URL they were already on, and no
//   Director could ever log in.
//
// What made it dangerous is that it was a WRONG ANSWER, not an error: every
// request still returned a valid HTTP response, with a valid-looking JSON body.
// Nothing crashed, no log line said anything was wrong, and the only user-visible
// symptom was a help message that was self-contradictory.
//
// WHAT IS DELIBERATELY NOT TESTED HERE, AND WHY
//
// The `if (kIsWeb)` branch -- step 2 of the resolution order, the one that caused
// the incident -- CANNOT be reached from `flutter test`. kIsWeb is a compile-time
// constant that is false in the Dart VM, so Uri.base is never consulted and the
// function falls through to the platform default.
//
// The test that would matter most is therefore not runnable in the suite that
// this package's CI runs. `flutter test --platform chrome` sets kIsWeb true and
// would cover it; that needs a web toolchain in CI and is a separate piece of
// work, not something to claim here. What IS covered below is every step of the
// resolution order that a VM test can reach, which is all of the normalisation
// and persistence logic that feeds it.

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pragnya_shared/pragnya_shared.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // AppConfig holds two process-lifetime statics. Without a reset in setUp, the
  // first test's value would be read by every test after it and the suite would
  // be testing nothing but its own ordering. This is the reason
  // AppConfig.debugResetCache exists.
  setUp(() {
    AppConfig.debugResetCache();
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
  });

  group('setCustomBaseUrl normalisation', () {
    test('a bare host is given an https scheme', () async {
      await AppConfig.setCustomBaseUrl('dps.example.com');
      expect(
        await AppConfig.getActiveBaseUrl(),
        'https://dps.example.com',
        reason: 'a host with no scheme would be parsed as a relative path and '
            'every request would go to the wrong place',
      );
    });

    test('an explicit http scheme is preserved, not upgraded', () async {
      // Local development points at http://10.0.2.2:8787 on the Android
      // emulator. Silently rewriting that to https would break local dev in a
      // way that looks like a network failure.
      await AppConfig.setCustomBaseUrl('http://10.0.2.2:8787');
      expect(await AppConfig.getActiveBaseUrl(), 'http://10.0.2.2:8787');
    });

    test('a trailing slash is stripped exactly once', () async {
      // ApiClient._buildUri strips one trailing slash itself and would leave a
      // second one behind, producing '//api/...' on every path. Catching it here
      // means the bug is a failing test rather than a 404 in production.
      await AppConfig.setCustomBaseUrl('https://dps.example.com/');
      expect(await AppConfig.getActiveBaseUrl(), 'https://dps.example.com');
    });

    test('surrounding whitespace is trimmed', () async {
      await AppConfig.setCustomBaseUrl('  https://dps.example.com  ');
      expect(await AppConfig.getActiveBaseUrl(), 'https://dps.example.com');
    });

    test('null returns to the platform default', () async {
      await AppConfig.setCustomBaseUrl('https://dps.example.com');
      await AppConfig.setCustomBaseUrl(null);
      expect(await AppConfig.getActiveBaseUrl(), AppConfig.defaultApiBaseUrl);
    });

    test('empty string returns to the platform default', () async {
      await AppConfig.setCustomBaseUrl('https://dps.example.com');
      await AppConfig.setCustomBaseUrl('   ');
      expect(await AppConfig.getActiveBaseUrl(), AppConfig.defaultApiBaseUrl);
    });

    test('setting the platform default clears the stored override', () async {
      // The stored key is what makes step 1 of the resolution order win. If
      // setting the default left a stale value in storage, a later app launch
      // would read it back and pin the user to a school they just left.
      await AppConfig.setCustomBaseUrl('https://dps.example.com');
      await AppConfig.setCustomBaseUrl(AppConfig.defaultApiBaseUrl);

      // Drop only the cache. Storage is deliberately NOT reset here, so this
      // asserts the delete actually happened -- resetting storage would make
      // the test pass whether or not setCustomBaseUrl cleared the key.
      AppConfig.debugResetCache();
      expect(await AppConfig.getActiveBaseUrl(), AppConfig.defaultApiBaseUrl);
    });
  });

  group('setSchoolSubdomainOrDomain', () {
    test('a bare slug becomes a subdomain of the platform domain', () async {
      await AppConfig.setSchoolSubdomainOrDomain('dps');
      expect(
        await AppConfig.getActiveBaseUrl(),
        'https://dps.${AppConfig.platformBaseDomain}',
      );
    });

    test('a full subdomain is used as-is', () async {
      await AppConfig.setSchoolSubdomainOrDomain('dps.pragnya.nasven.com');
      expect(
        await AppConfig.getActiveBaseUrl(),
        'https://dps.pragnya.nasven.com',
      );
    });

    test('a school on a completely different domain is honoured', () async {
      // Enterprise schools run on their own domain. Treating anything that
      // contains a dot as "must be under pragnya.nasven.com" would break them.
      await AppConfig.setSchoolSubdomainOrDomain('portal.acme.edu');
      expect(await AppConfig.getActiveBaseUrl(), 'https://portal.acme.edu');
    });

    test('the input is lowercased and trimmed', () async {
      // A host is case-insensitive, but a stored value that differs from the
      // canonical form defeats any future string comparison against it.
      await AppConfig.setSchoolSubdomainOrDomain('  DPS.Example.COM  ');
      expect(await AppConfig.getActiveBaseUrl(), 'https://dps.example.com');
    });

    test('an empty input resets to the platform default', () async {
      await AppConfig.setSchoolSubdomainOrDomain('dps');
      await AppConfig.setSchoolSubdomainOrDomain('   ');
      expect(await AppConfig.getActiveBaseUrl(), AppConfig.defaultApiBaseUrl);
    });

    test('the slug is remembered for getSchoolDomain', () async {
      await AppConfig.setSchoolSubdomainOrDomain('dps');
      expect(await AppConfig.getSchoolDomain(), 'dps');
    });
  });

  group('getActiveHost', () {
    test('the host is extracted from a subdomain URL', () async {
      await AppConfig.setCustomBaseUrl('https://dps.pragnya.nasven.com');
      expect(
        await AppConfig.getActiveHost(),
        'dps.pragnya.nasven.com',
        reason: 'this value is sent as the X-School-Domain header, so it must '
            'be the bare host with no scheme and no path',
      );
    });

    test('a non-default port is dropped from the host', () async {
      // Host, not authority. 'localhost:8787' as an X-School-Domain value would
      // not match any configured school domain server-side.
      await AppConfig.setCustomBaseUrl('http://localhost:8787');
      expect(await AppConfig.getActiveHost(), 'localhost');
    });

    test('a value that is not a URL falls back to the platform domain', () async {
      // Uri.parse('https://[not a url') throws FormatException -- the bracket
      // opens an IPv6 host that is never closed. That is the one failure this
      // catch exists for, so it is the string used here; a value like
      // 'https://exa mple.com' does NOT throw, Uri encodes the space and yields
      // host 'exa%20mple.com', which would make this test pass for the wrong
      // reason.
      //
      // Fails closed to a known-good value rather than propagating garbage into
      // a header the server uses to pick a tenant.
      await AppConfig.setCustomBaseUrl('https://[not a url');
      expect(await AppConfig.getActiveHost(), AppConfig.platformBaseDomain);
    });
  });

  group('persistence across a restart', () {
    // The cache is a static, so "restart" here means: clear the cache and the
    // mock storage, then read again. This is what the next app launch does.
    test('a stored base URL is read back after the cache is dropped', () async {
      await AppConfig.setCustomBaseUrl('https://dps.example.com');
      AppConfig.debugResetCache();
      expect(
        await AppConfig.getActiveBaseUrl(),
        'https://dps.example.com',
        reason: 'a school pinned to a custom domain must stay pinned across '
            'reloads, otherwise the app silently migrates it back to the apex',
      );
    });

    test('a stored slug is read back after the cache is dropped', () async {
      await AppConfig.setSchoolSubdomainOrDomain('dps');
      AppConfig.debugResetCache();
      expect(await AppConfig.getSchoolDomain(), 'dps');
    });

    test('nothing stored yields the platform default', () async {
      // The VM has kIsWeb false, so this reaches step 3. On web the same inputs
      // would yield Uri.base.origin instead -- see the header comment.
      expect(await AppConfig.getActiveBaseUrl(), AppConfig.defaultApiBaseUrl);
      expect(await AppConfig.getActiveHost(), AppConfig.platformBaseDomain);
    });

    test('a whitespace-only stored value is treated as unset', () async {
      // A stored blank must not win step 1 and produce a base URL of '' , which
      // would turn every request into a relative URL.
      FlutterSecureStorage.setMockInitialValues(
        <String, String>{'custom_api_base_url': '   '},
      );
      expect(await AppConfig.getActiveBaseUrl(), AppConfig.defaultApiBaseUrl);
    });
  });

  group('constants', () {
    test('the platform default is https and has no trailing slash', () {
      // A trailing slash here would make every joined path a double slash, and
      // ApiClient strips only one.
      expect(AppConfig.defaultApiBaseUrl, 'https://pragnya.nasven.com');
      expect(AppConfig.defaultApiBaseUrl.endsWith('/'), isFalse);
    });

    test('the platform base domain matches the default base URL host', () {
      // These two are used in different places: one for the URL, one for the
      // X-School-Domain header. If they disagree, requests carry a host the
      // tenant resolver does not know.
      expect(
        Uri.parse(AppConfig.defaultApiBaseUrl).host,
        AppConfig.platformBaseDomain,
      );
    });
  });
}
