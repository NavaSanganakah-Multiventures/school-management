#!/usr/bin/env node
// scripts/verify-routing.mjs
//
// Guards the hostname routing contract:
//
//   pragnya.nasven.com          -> the public WEBSITE (Next.js static export)
//   <slug>.pragnya.nasven.com   -> that school's Flutter portal
//   admin.pragnya.nasven.com    -> the Super Admin console
//
// and nothing else. Specifically: the website must never be reachable on a
// subdomain that belongs to a school.
//
// WHY THIS NEEDS A GUARD
//
// wrangler.toml used to route the platform worker on `*.pragnya.nasven.com/*`
// with a comment describing it as a fallback for unclaimed subdomains. That
// fallback was the defect. Because the platform worker's static assets are the
// marketing website, every school subdomain without a deployed dedicated worker
// rendered the 84 KB landing page. Verified in production before the fix:
//
//   pragnya.nasven.com            -> website            (intended)
//   school795082.pragnya...       -> school app         (intended)
//   school813529.pragnya...       -> WEBSITE            (trial, unprovisioned)
//   a-random-unclaimed-slug...   -> WEBSITE            (does not exist)
//
// Registration is instant-trial, so POST /api/auth/register hands the customer
// `https://<slug>.pragnya.nasven.com` immediately, while the dedicated worker
// only exists after the next deploy. In that window their own "portal" link
// showed them the marketing site, and its /api/config reported the platform
// placeholder tenant `school-01` rather than their school.
//
// A wildcard route is easy to reintroduce by accident: it looks like a harmless
// safety net, and every school still appears to work, because the broken case
// only affects schools that are mid-provisioning or misspelled. So the wildcard
// is asserted absent here rather than left to review.

import fs from 'fs';

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log('  PASS  ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function readIfPresent(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

// Strips comments so that prose describing a bad pattern is not mistaken for the
// bad pattern itself. A check that trips over its own explanatory comment is a
// check people learn to ignore.
//
// LINE ENDINGS MATTER HERE, and getting it wrong makes the stripper a silent
// no-op.
//
// Splitting on '\n' leaves a trailing '\r' on every line of a CRLF file, and in
// JavaScript regex `.` does NOT match `\r` because it is a line terminator. So
// `/#.*$/` looks like it should strip a CRLF comment and does not: `.*` stops
// before the `\r`, `$` does not match mid-string, the match fails, and the
// comment survives. Confirmed directly:
//
//   "      # comment\r".replace(/#.*$/, '')      -> unchanged
//   "      # comment\r".replace(/#.*/,  '')      -> "      \r"
//
// The `$` anchor is what turns a partial match into no match at all. So lines are
// split on /\r?\n/ and joined with '\n', normalising endings before any stripping.
// Without that, this file's checks silently passed only on the sources that happen
// to be LF, and failed on the ones that are CRLF -- which is most of them, and
// not reproducibly.
function splitLines(src) {
  return src.split(/\r?\n/);
}

function stripComments(src) {
  // Block comments span lines, so they are removed from the whole source first.
  // Then normalise endings, then strip line comments per line.
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return splitLines(noBlocks)
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

// Same idea for TOML and YAML, which use `#`.
function stripTomlComments(src) {
  return splitLines(stripComments(src))
    .map((l) => l.replace(/(^|\s)#.*$/, '$1'))
    .join('\n');
}

// The hostname portion of a Cloudflare route pattern, i.e. everything before the
// first `/`.
//
// The `*` that matters is only the one in the HOST. Every Cloudflare route ends
// its host with `/*` to mean "and all paths", so testing `pattern.includes('*')`
// would flag every correct route in the repo. An earlier version of this check
// did exactly that and failed on two configs that were already right.
function hostOf(pattern) {
  return String(pattern).split('/')[0];
}

function routePatterns(toml) {
  return Array.from(stripComments(toml).matchAll(/pattern\s*=\s*"([^"]+)"/g)).map((m) => m[1]);
}

function wildcardHosts(patterns) {
  return patterns.filter((p) => hostOf(p).includes('*')).map(hostOf);
}

const APEX = 'pragnya.nasven.com';
const BASE_DOMAIN = 'nasven.com';

let knownIssues = 0;
function known(message) {
  knownIssues++;
  console.log('  KNOWN  ' + message);
}

console.log('\nRouting contract verification\n');

// ---- 1. the platform worker must not own a wildcard ------------------------
{
  const toml = readIfPresent('wrangler.toml') || '';
  const patterns = routePatterns(toml);
  const wildcards = wildcardHosts(patterns);

  check(
    'wrangler.toml declares no wildcard HOST route',
    wildcards.length === 0,
    'found wildcard hosts: ' + JSON.stringify(wildcards),
  );
  check(
    'wrangler.toml routes the apex explicitly',
    patterns.indexOf(APEX + '/*') !== -1,
    'patterns: ' + JSON.stringify(patterns),
  );
  check(
    'the platform worker is the only one serving the public website',
    (stripComments(toml).match(/directory\s*=\s*"\.\/out"/g) || []).length === 1,
    'the ./out Next.js export should appear exactly once, in wrangler.toml',
  );
}

// ---- 2. the Super Admin console must not depend on wildcard precedence -----
{
  const toml = readIfPresent('wrangler.admin.toml') || '';
  const patterns = routePatterns(toml);
  check(
    'wrangler.admin.toml routes the admin host explicitly',
    patterns.indexOf('admin.' + APEX + '/*') !== -1,
    'patterns: ' + JSON.stringify(patterns),
  );
  check(
    'wrangler.admin.toml declares no wildcard HOST route',
    wildcardHosts(patterns).length === 0,
    'the admin console must own its own host outright, not win a precedence contest',
  );
}

// ---- 3. every dedicated school needs its own explicit route ---------------
{
  const gen = readIfPresent('scripts/generate-school-configs.mjs') || '';
  check(
    'dedicated configs still emit an explicit per-slug route',
    gen.indexOf("pattern = '\" + routeDomain + '/*'") !== -1
      || /routeDomain\s*\+\s*['"]\/\*/.test(gen),
    'generate-school-configs.mjs no longer appears to build <slug>.<domain>/*',
  );

  // Reserved slugs cannot be provisioned and are skipped on purpose. Every
  // other dedicated school is expected to be covered by its own worker, which is
  // what makes the wildcard unnecessary.
  const reservedMatch = gen.match(/const RESERVED_SLUGS = new Set\(\[([\s\S]*?)\]\)/);
  const reserved = new Set(
    reservedMatch
      ? Array.from(reservedMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1])
      : [],
  );

  const registryRaw = readIfPresent('schools.json');
  if (registryRaw) {
    const registry = JSON.parse(registryRaw);
    const dedicated = (registry.schools || []).filter((s) => s && s.mode === 'dedicated');
    check(
      'at least one dedicated school is configured (sanity)',
      dedicated.length > 0,
      'schools.json reported no dedicated schools',
    );
    check(
      'generate-school-configs.mjs skips reserved slugs instead of aborting',
      gen.indexOf('RESERVED_SLUGS.has') !== -1,
      'a reserved slug must not be able to stop the rest of the fleet deploying',
    );
    check(
      'generate-school-configs.mjs exits 0 so the deploy continues past a collision',
      /reservedCollisions\.length\s*>\s*0/.test(stripComments(gen)),
      'the collision should be reported loudly but must not fail the deploy',
    );

    // A school holding a reserved slug is a PROVISIONING gap, not a routing
    // violation. Its host is either owned by the platform (admin.pragnya...) or
    // simply unclaimed, and in both cases nothing gets misrouted: the website
    // cannot leak onto a school host, which is the property this file guards.
    //
    // So it is reported rather than failed. Asserting it as a failure would mean
    // CI stays red until someone renames a live customer tenant, which is a
    // business decision and not something a test should be able to force.
    const colliding = dedicated.filter((s) => reserved.has(String(s.slug)));
    if (colliding.length > 0) {
      for (const s of colliding) {
        known(
          'school "' + (s.name || '?') + '" holds the reserved slug "' + s.slug
          + '" and stays on the shared worker. Its public URL must be moved to a '
          + 'non-reserved subdomain before it can be provisioned. Not a routing fault.',
        );
      }
    }
  } else {
    check('schools.json is readable', false, 'file not found');
  }
}

// ---- 4. registration must not advertise a URL that is not live -----------
{
  const auth = readIfPresent('api/auth/index.ts') || '';
  check(
    'register reports an explicit portalStatus',
    auth.indexOf('portalStatus') !== -1,
  );
  check(
    'register nulls dedicatedUrl while provisioning',
    /dedicatedUrl:\s*portalLive\s*\?/.test(auth),
    'expected `dedicatedUrl: portalLive ? portalUrl : null`',
  );
  check(
    'register exposes something reachable instead (platformUrl)',
    auth.indexOf('platformUrl') !== -1,
  );

  const form = readIfPresent('components/website/register-form.tsx') || '';
  const formCode = stripComments(form);
  check(
    'register form does not build an href from a nullable dedicatedDomain',
    formCode.indexOf("'https://' + result.dedicatedDomain") === -1,
    'that expression yields the literal string "https://null" when the field is null',
  );
  check(
    'register form gates its portal link on portalStatus',
    formCode.indexOf("result.portalStatus === 'live'") !== -1,
  );
}

// ---- 5. the welcome email must not push a dead portal link ---------------
{
  const email = readIfPresent('api/lib/email.ts') || '';
  check(
    'welcome email can express a pending portal',
    email.indexOf('portalPending') !== -1,
  );
  check(
    'welcome email has a platformUrl fallback for the pending case',
    email.indexOf('platformUrl') !== -1,
  );
  check(
    'welcome email is not hardcoded to a single link style',
    /portalPending\s*!==\s*false/.test(email),
    'expected the pending branch to be actually branched on',
  );
}

// ---- 6. previews must be Previews, not a second Worker --------------------
//
// The branch model asked for is: feature branch -> Preview of the production
// Worker, main -> production. Cloudflare offers two ways to get an environment,
// and only one of them is a Preview:
//
//   [previews] + `wrangler preview`      -> under the SAME Worker
//   [env.preview] + `deploy --env`       -> a separately named Worker
//
// The second was what this repo had, and it is the model Cloudflare's own
// comparison page recommends against for branch testing. It also forced two
// workarounds that existed only because it was a separate Worker: `routes = []`
// so the env would not claim `pragnya.nasven.com/*`, and a `send_email` binding
// that let anyone with the preview URL send real email from the real domain.
// A Preview takes no zone routes and no cron triggers, so neither is expressible.
{
  const toml = stripTomlComments(readIfPresent('wrangler.toml') || '');

  check(
    'wrangler.toml has no [env.preview] (a Wrangler environment is a separate Worker)',
    !/\[\s*env\s*\.\s*preview/i.test(toml)
      && !/^\s*env\s*\.\s*preview/im.test(toml),
    'previews belong in a [previews] block, deployed with `wrangler preview`',
  );
  check(
    'wrangler.toml declares a [previews] block',
    /^\s*\[previews\]/m.test(toml),
  );
  check(
    'previews are named ENVIRONMENT = "preview"',
    /^\s*ENVIRONMENT\s*=\s*"preview"\s*$/m.test(toml),
    'previews do not inherit production vars, so ENVIRONMENT must be restated',
  );
  check(
    'previews bind no send_email',
    !/previews[\s\S]{0,200}send_email/.test(toml) && !/send_email[\s\S]{0,200}previews/.test(toml),
    'a preview that can send email is a spam relay on the real sending domain',
  );

  // Migrations must be able to reach the preview D1 without any binding in the
  // config they use that points at production.
  const mig = stripTomlComments(readIfPresent('wrangler.preview-migrations.toml') || '');
  check(
    'wrangler.preview-migrations.toml exists',
    fs.existsSync('wrangler.preview-migrations.toml'),
    'needed so migrations can never be applied through the production `DB` binding',
  );
  check(
    'the preview migrations binding is not named DB',
    !/binding\s*=\s*"DB"/.test(mig),
    'a file with a `DB` binding reads like an ordinary override; a distinct name '
      + 'makes an accidental production migration a visible mistake',
  );

  // The migration target and the Preview binding must be the same physical
  // database, or migrations land somewhere no Preview reads.
  const migId = (mig.match(/database_id\s*=\s*"([^"]+)"/) || [])[1];
  const previewBlock = (toml.match(/\[\[previews\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)/) || [])[1] || '';
  const previewId = (previewBlock.match(/database_id\s*=\s*"([^"]+)"/) || [])[1];
  check(
    'the preview migration target matches the previews D1 binding',
    !!migId && !!previewId && migId === previewId,
    'wrangler.preview-migrations.toml: ' + migId + ' vs wrangler.toml previews: ' + previewId,
  );

  // The top-level `DB` binding is production. If the preview migrations file ever
  // gains one, a branch build could migrate production.
  const prodId = (toml.match(/^\s*database_id\s*=\s*"([^"]+)"/m) || [])[1];
  check(
    'the preview migration target is not the production database',
    !!migId && !!prodId && migId !== prodId,
    'preview migrations point at ' + migId + ', production `DB` is ' + prodId,
  );
}

// ---- 7. one wrangler version, and new enough for Previews ------------------
{
  const pkg = JSON.parse(readIfPresent('package.json') || '{}');
  const pinned = (pkg.devDependencies || {}).wrangler;
  check(
    'wrangler is a devDependency',
    !!pinned,
    'a floating npx wrangler@latest means a release can change deploys with no commit',
  );
  check(
    'the wrangler devDependency is pinned exactly (no ^ or ~)',
    !!pinned && !/^[\^~]/.test(pinned),
    'found: ' + pinned,
  );

  const PREVIEWS_MIN = [4, 135, 0];
  const got = String(pinned || '').split('.').map((n) => parseInt(n, 10) || 0);
  const newEnough = got[0] > PREVIEWS_MIN[0]
    || (got[0] === PREVIEWS_MIN[0] && (got[1] > PREVIEWS_MIN[1]
      || (got[1] === PREVIEWS_MIN[1] && got[2] >= PREVIEWS_MIN[2])));
  check(
    'wrangler >= 4.135.0, which Worker Previews require',
    newEnough,
    'found ' + pinned + ', need >= 4.135.0 or `wrangler preview` does not exist',
  );

  // No command may pin its own wrangler version any more: the lockfile is the
  // single source of truth, and a per-command pin is how three versions drifted
  // apart in the first place.
  //
  // Comments are stripped first. These files all *describe* the pins that used to
  // exist (`a floating wrangler@4 in three scripts`), and without stripping, the
  // documentation of the bug reads as the bug. That is the same false positive the
  // route-pattern and register-form checks had.
  const sources = [
    ...fs.readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'))
      .map((f) => '.github/workflows/' + f),
    ...fs.readdirSync('scripts').filter((f) => f.endsWith('.mjs')).map((f) => 'scripts/' + f),
  ];
  const drifting = [];
  for (const p of sources) {
    const src = readIfPresent(p);
    if (!src) continue;
    // YAML uses `#`, JS uses `//`. Strip both regardless of the file's language.
    const code = stripTomlComments(src);
    for (const m of code.matchAll(/wrangler@\d/g)) drifting.push(p + ' -> ' + m[0]);
  }
  check(
    'no workflow or script pins its own wrangler version',
    drifting.length === 0,
    'use the devDependency so every pipeline runs one build: ' + drifting.join(', '),
  );
}

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' routing contract check(s) failed\n');
  process.exit(1);
}
console.log(
  'All routing contract checks passed.'
  + (knownIssues > 0 ? ' (' + knownIssues + ' known issue(s) reported above, not failures.)' : '')
  + '\n',
);
