// api/lib/roles.ts
// Single source of truth for who may do what.
//
// WHY THIS FILE EXISTS
// Before this, `PlatformRole` in api/lib/auth.ts and api/lib/permissions.ts was
// declared as:
//     'SuperAdmin' | 'Director' | 'Principal' | 'Staff'
// but the database has allowed 5 school roles since migration 0034:
//     'Director', 'Principal', 'Staff', 'Parents', 'Students'
// and db_migrations/0006_fcm_device_tokens.sql defaults a role to 'Parents'.
//
// Because 'Parents' and 'Students' were not in the TypeScript union, the role
// checks throughout the API were written to special-case only 'Staff'. A check
// like `if (role === 'Staff') { verifyClassTeacher() }` therefore silently
// ALLOWS a Parent or a Student straight through. That is the root cause of the
// authorization findings in the audit, and it is a type-system failure as much
// as a logic one.
//
// Every role check in the codebase must go through the helpers here so that a
// new role cannot be forgotten: the allowlists are explicit, and anything not
// listed is denied.

/** Control-plane role. Never valid on a dedicated school worker. */
export const SUPER_ADMIN = 'SuperAdmin';

/** Roles that can be assigned inside a school (the "management" roles). */
export const MANAGEMENT_ROLES = ['Director', 'Principal'] as const;

/** Roles that operate on academic data, optionally scoped to assigned classes. */
export const TEACHING_ROLES = ['Staff', 'Teacher'] as const;

/** Roles that represent a family member or the student themself. */
export const FAMILY_ROLES = ['Parent', 'Parents', 'Student', 'Students'] as const;

export const ALL_ROLES = [
  SUPER_ADMIN,
  ...MANAGEMENT_ROLES,
  ...TEACHING_ROLES,
  ...FAMILY_ROLES,
] as const;

export type Role = (typeof ALL_ROLES)[number];

/** Roles that a school-side user account can hold. */
export type SchoolRole = Exclude<Role, typeof SUPER_ADMIN>;

/**
 * The database currently stores 'Parents' and 'Students' (plural) because that
 * is what migration 0034 put in the CHECK constraint, while the UI and the audit
 * refer to the singular forms. Both are accepted and normalised here so a route
 * check does not have to care which spelling arrived from the token or the row.
 */
const ROLE_ALIASES: Record<string, Role> = {
  parent: 'Parent',
  parents: 'Parent',
  student: 'Student',
  students: 'Student',
  teacher: 'Teacher',
  staff: 'Staff',
  director: 'Director',
  principal: 'Principal',
  superadmin: SUPER_ADMIN,
};

export function normalizeRole(value: any): Role | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return ROLE_ALIASES[raw.toLowerCase()] || null;
}

export function isManagement(role: any): boolean {
  return normalizeRole(role) === 'Director' || normalizeRole(role) === 'Principal';
}

export function isTeaching(role: any): boolean {
  const r = normalizeRole(role);
  return r === 'Staff' || r === 'Teacher';
}

export function isFamily(role: any): boolean {
  const r = normalizeRole(role);
  return r === 'Parent' || r === 'Student';
}

/** Director + Principal: full authority inside their own school. */
export function isAdminOfSchool(role: any): boolean {
  return isManagement(role);
}

/** Roles allowed to record/mutate money. */
export function canManageFees(role: any): boolean {
  return isManagement(role);
}

/** Roles allowed to create or edit academic records (marks, exams, setup). */
export function canManageAcademics(role: any): boolean {
  return isManagement(role) || isTeaching(role);
}

/** Roles allowed to publish or delete a school-wide notice. */
export function canManageNotices(role: any): boolean {
  return isManagement(role);
}

/** Roles allowed to see whole-school analytics rather than only their scope. */
export function canViewSchoolWideAnalytics(role: any): boolean {
  return isManagement(role);
}

/** Roles allowed to administer staff accounts, fees heads, subjects, config. */
export function canManageSchoolSettings(role: any): boolean {
  return isManagement(role);
}

export const ROLE_LABELS_HI: Record<Role, string> = {
  SuperAdmin: 'सुपर एडमिन',
  Director: 'निदेशक',
  Principal: 'प्रधानाचार्य',
  Staff: 'शिक्षक',
  Teacher: 'शिक्षक',
  Parent: 'अभिभावक',
  Students: 'विद्यार्थी',
} as unknown as Record<Role, string>;
