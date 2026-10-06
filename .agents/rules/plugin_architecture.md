---
trigger: always_on
description: Plugin architecture — backend is Hono, the UI is Flutter
---

# Plugin Architecture Guidelines

## The one thing to know first

**The UI is Flutter, not React.** `components/school-crm-shell.tsx` and the `plugins/`
folder at the repo root existed, had a `PLUGINS_REGISTRY`, and were never mounted by
anything — `app/page.tsx` renders only `LandingPage`. Both are deleted. An agent that
follows an older version of this file will build a plugin that no user can ever reach.

| | Where |
|---|---|
| Entitlement / catalogue | `db_migrations/` → `plugins` and `school_plugins` rows |
| Backend | `api/<plugin>/index.ts`, registered in `api/index.ts` |
| UI | `flutter_apps/school_management_app/lib/screens/` + `lib/routes/app_router.dart` |
| Public website (React, still live) | `components/website/` — landing + registration only |

## Backend
1. **Migration**: a new file in `db_migrations/` (e.g. `0044_plugin_xyz.sql`) with
   `INSERT OR IGNORE INTO plugins (...)`. Two rules the repo has already been bitten by:
   - **Never use a bare `ALTER TABLE … ADD COLUMN`.** SQLite has no `IF NOT EXISTS` form,
     so 19 of the 42 migrations are not re-runnable. List them in
     `KNOWN_NON_IDEMPOTENT` (`scripts/verify-migrations-apply.mjs`) or CI fails.
   - **A table rebuild must name every column it replaces.** Migration 0040 omitted six
     and destroyed `created_at` and all four `razorpay_*` columns on every database.
     `scripts/verify-migration-0040-rebuild.mjs` now fails on any dropped column.
2. **Routes**: `api/<plugin>/index.ts` exporting a Hono app.
3. **Register**: `app.route('/api/<plugin>', <plugin>App);` in `api/index.ts`.

## Entitlement is enforced in two places, and both matter

`GET /api/plugins` lists only what a school may see:
```sql
WHERE is_active = 1 AND (type = 'global' OR (type = 'private' AND target_school_id = ?))
```
`POST /api/plugins/subscribe` must apply **the same predicate**. It once selected by
`id` alone, so any Director could activate a paid plugin another tenant owned. A plugin
is only as private as its write path.

Billing is platform-only: a dedicated worker proxies billing/plugins/features to the
platform over a signed M2M channel, and the plan is the platform's own database — never
the school's word.

## Flutter UI
1. **Screen** — `lib/screens/plugin_xyz_screen.dart`.
2. **Service** — `lib/services/plugin_xyz_service.dart`, calling the endpoint via
   `ApiClient`.
3. **Route** — register in `lib/routes/app_router.dart`; role gating goes through
   `dashboardPathForRole` in `lib/providers/auth_provider.dart`.
4. **Every `await` that returns to `setState` or `showSnack` needs a `mounted` check.**

That last rule is not advice, it is the app's largest crash source. `flutter analyze`
reports `use_build_context_synchronously` for each one; CI runs `flutter analyze` with
`--no-fatal-infos`, so it will not fail on its own. Two patterns are accepted:
- screen-level: `if (!mounted) return;` before `setState`
- inside a dialog: capture `final messenger = ScaffoldMessenger.of(c);` **before** the
  await, then `showSnackVia(messenger, …)` — because a `mounted` check on the dialog's
  context says nothing about the screen context the old code was actually using.

## Offline / tenant safety
Nothing user-scoped may live in a static that outlives a login. `PdfService` caches the
school profile and `FcmNotificationService` caches topic subscriptions; both are cleared
by `AuthService.logout()` and `clearCurrentUser()`. A new global cache must be registered
there too, or the next school inherits it.