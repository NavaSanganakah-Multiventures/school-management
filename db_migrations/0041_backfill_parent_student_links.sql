-- 0041: backfill parent_student_links for families that already exist.
--
-- WHY
-- Migration 0039 created parent_student_links and Phase 1 made family scoping
-- deny-by-default on it: api/lib/rbac.ts (getFamilyStudentScope) treats a missing
-- or unreadable table as an EMPTY scope, never as "all students".
--
-- That is the correct default for PII, but nothing ever wrote a row. So the moment
-- 0039 shipped, every Parent and Student account in every school -- existing and
-- new -- resolved to an empty scope. A parent portal with no children in it is not
-- a fail-closed default, it is a broken product, and the two look identical from
-- the outside.
--
-- This migration links the families that are already there, using contact details
-- the school already holds. No new UI, no manual step.
--
-- MATCHING, AND WHY IT IS DELIBERATELY CONSERVATIVE
--
--   Parent account  ->  students.parent_phone  == system_users.phone
--   Student account ->  students.email        == system_users.email
--
-- Both are restricted to the SAME school, because a phone number or an address is
-- not unique across the platform and a cross-school link would be a PII leak
-- between tenants.
--
-- A link is created ONLY where exactly one candidate student matches. If two
-- siblings share a parent's phone -- which is the normal case for a family with
-- more than one child in the school -- the parent is linked to ALL of them,
-- because that is unambiguous. What is excluded is the genuinely ambiguous case:
-- one parent_phone matching two DIFFERENT students who are not the same person,
-- and an account that matches nothing.
--
-- Wait, that sentence is contradictory, so to be precise about the two rules:
--
--   1. A parent_phone matching N students links that parent to all N. Siblings
--      legitimately share a number, and leaving them all unlinked would mean a
--      family with two children in the school still sees nothing.
--   2. A parent_phone matching students in MORE THAN ONE school is skipped, since
--      the match cannot be attributed to a single tenant.
--
-- Student accounts match on email, which is UNIQUE in system_users and
-- per-student, so that join cannot be ambiguous.
--
-- Transaction-free: `wrangler d1 migrations apply` wraps each file in its own
-- atomic transaction and a manual one is rejected on remote D1.
-- IMPORTANT: wrangler's splitter reads the raw file and does NOT strip `--`
-- comments, so do not name those keywords even inside a comment, or it rejects
-- the file with "contains several transactions". That is what made fresh databases
-- unmigratable via 0034. Keep them out of this file.

-- ---------------------------------------------------------------------------
-- 1. Parent accounts -> their children, by phone, within one school
-- ---------------------------------------------------------------------------
-- `is_primary` is set for every link because a parent is the primary contact for
-- each of their own children; the column distinguishes the family's main contact
-- from an additional one recorded against the same child, not a primary child.
INSERT INTO parent_student_links
    (id, school_id, parent_user_id, student_id, relationship, is_primary, created_at, updated_at)
SELECT
    'psl-' || u.school_id || '-' || u.id || '-' || s.id,
    u.school_id,
    u.id,
    s.id,
    'Parent',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM system_users u
JOIN students s
  ON s.school_id = u.school_id
 AND TRIM(s.parent_phone) <> ''
 AND TRIM(s.parent_phone) = TRIM(u.phone)
WHERE u.role IN ('Parent', 'Parents')
  AND u.school_id IS NOT NULL AND u.school_id <> ''
  AND s.school_id IS NOT NULL AND s.school_id <> ''
  -- Rule 2: the number must not also identify students in another school.
  AND NOT EXISTS (
      SELECT 1 FROM students s2
      WHERE TRIM(s2.parent_phone) = TRIM(u.phone)
        AND s2.school_id <> u.school_id
  )
  -- Idempotent: re-running is a no-op rather than a UNIQUE violation.
  AND NOT EXISTS (
      SELECT 1 FROM parent_student_links l
      WHERE l.school_id = u.school_id
        AND l.parent_user_id = u.id
        AND l.student_id = s.id
  );

-- ---------------------------------------------------------------------------
-- 2. Student accounts -> themselves, by email, within one school
-- ---------------------------------------------------------------------------
-- system_users.email is UNIQUE and students.email is per-student, so this join
-- cannot fan out the way the phone join above does.
--
-- TRIM and LOWER on both sides: a school may have typed a trailing space, and
-- email comparison is otherwise case-sensitive, which would silently drop
-- legitimate links on a case difference alone.
INSERT INTO parent_student_links
    (id, school_id, parent_user_id, student_id, relationship, is_primary, created_at, updated_at)
SELECT
    'psl-' || u.school_id || '-' || u.id || '-' || s.id,
    u.school_id,
    u.id,
    s.id,
    'Self',
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM system_users u
JOIN students s
  ON s.school_id = u.school_id
 AND TRIM(s.email) <> ''
 AND LOWER(TRIM(s.email)) = LOWER(TRIM(u.email))
WHERE u.role IN ('Student', 'Students')
  AND u.school_id IS NOT NULL AND u.school_id <> ''
  AND s.school_id IS NOT NULL AND s.school_id <> ''
  AND NOT EXISTS (
      SELECT 1 FROM parent_student_links l
      WHERE l.school_id = u.school_id
        AND l.parent_user_id = u.id
        AND l.student_id = s.id
  );
