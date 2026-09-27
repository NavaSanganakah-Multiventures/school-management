-- Fixtures for verifying migration 0041. Deliberately includes the cases that
-- could go wrong, so the test proves the guards work rather than just that the
-- happy path runs.
--
--   u-priya   -> Priya's three children              (shared phone, expected 3 links)
--   u-amb     -> a child in ANOTHER school too        (expected 0 links, ambiguous)
--   u-nomatch -> no matching child                    (expected 0 links)
--   u-self    -> their own student record             (expected 1 link, case-insensitive)
--   u-rahul   -> a Staff account sharing that phone   (expected 0 links, not a family role)
--   u-priya2  -> same phone, different school         (expected 0 links, cross-tenant)
--
-- NOTE: roles are stored PLURAL by migration 0034's CHECK constraint
-- ('Parents', 'Students'), which is why the accounts below use those spellings.
-- Migration 0041 accepts both spellings because roles.ts normalises them, but a
-- fixture that violates the CHECK constraint tests nothing.

DELETE FROM parent_student_links;
DELETE FROM students;
DELETE FROM system_users;

INSERT INTO system_users (id, username, full_name, email, phone, role, designation, school_id, status)
VALUES
  ('u-dir-1',  'principalA', 'Asha Principal', 'asha@school1.test',  '9800000001', 'Principal', 'Principal', 'school-1', 'Active'),
  ('u-priya',  'priya',      'Priya Parent',   'priya@fam.test',    '9811111111', 'Parents',   'Parent',    'school-1', 'Active'),
  ('u-amb',    'amb',        'Ambiguous Parent','amb@fam.test',     '9822222222', 'Parents',   'Parent',    'school-1', 'Active'),
  ('u-nomatch','nomatch',    'No Match Parent','nomatch@fam.test', '9833333333', 'Parents',   'Parent',    'school-1', 'Active'),
  ('u-self',   'selfstud',   'Self Student',   'SELF.STUD@school1.test', '9844444444', 'Students', 'Student',  'school-1', 'Active'),
  ('u-rahul',  'rahul',      'Rahul Staff',    'rahul@school1.test','9811111111', 'Staff',     'Teacher',   'school-1', 'Active'),
  ('u-priya2', 'priya2',     'Priya Other',    'priya@other.test',  '9811111111', 'Parents',   'Parent',    'school-2', 'Active');

INSERT INTO students (id, roll_number, first_name, last_name, class_id, class_name, section, gender, parent_name, parent_phone, email, school_id)
VALUES
  ('s-1', 'R1', 'Aarav', 'Sharma', 'c-1', 'Class 1', 'A', 'Male',   'Priya',  '9811111111', 'aarav@school1.test',  'school-1'),
  ('s-2', 'R2', 'Diya',  'Sharma', 'c-1', 'Class 1', 'A', 'Female', 'Priya',  '9811111111', 'diya@school1.test',   'school-1'),
  ('s-3', 'R3', 'Vivaan','Sharma', 'c-2', 'Class 2', 'A', 'Male',   'Priya',  '9811111111', 'vivaan@school1.test', 'school-1'),
  -- Ambiguous: Amb's phone identifies a child in school-1 AND in school-2.
  ('s-4', 'R4', 'Cross', 'School', 'c-1', 'Class 1', 'A', 'Male',   'Amb',    '9822222222', 'cross@school1.test',  'school-1'),
  ('s-5', 'R5', 'Else',  'Where',  'c-1', 'Class 1', 'A', 'Female', 'Amb',    '9822222222', 'else@school2.test',   'school-2'),
  -- Self-match is deliberately mixed case, to prove the LOWER(TRIM(...)) join.
  ('s-6', 'R6', 'Meera', 'Kumar',  'c-3', 'Class 3', 'A', 'Female', 'Other',  '9899999999', 'self.stud@school1.test', 'school-1');

