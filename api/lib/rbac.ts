// api/lib/rbac.ts
// Deny-by-default authorization helpers for Hono routes.
//
// THE BUG THIS FIXES
// api/index.ts mounted every route module with no authorization middleware.
// Each route then rolled its own check, and the common shape was:
//
//     const authUser = await getAuthUser(c);
//     if (!authUser) return c.json({ ... }, 401);
//     if (authUser.role === 'Staff') { /* must be class teacher */ }
//
// That only ever denies 'Staff'. A 'Parent' or 'Student' token — roles the DB
// has allowed since migration 0034 — passed straight through. Consequences
// included any authenticated user being able to mark a fee invoice paid without
// paying, rewrite any student's marks, read every student's Aadhaar and bank
// details, publish school-wide notices, and delete students.
//
// THE RULE NOW
//   1. Every route declares who may call it, explicitly.
//   2. Anything not declared is DENIED. There is no "special case Staff only".
//   3. A role that is not in the known set is DENIED, not allowed through.
//   4. Hidden UI is never the control; these checks are the control.

import { getAuthUser, getRequestSchoolId } from './auth';
import { getDB } from '../db';
import { isClassTeacher, getAssignedClassNames } from './permissions';
import {
  isFamily,
  isManagement,
  isTeaching,
  normalizeRole,
  type Role,
} from './roles';

export type { Role };

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  schoolId: string;
  raw: any;
}

export type GuardResult =
  | { ok: true; user: SessionUser; schoolId: string; db: any }
  | { ok: false; response: Response };

function deny(c: any, message: string, status: 401 | 403 = 403): Response {
  return c.json({ success: false, message }, status);
}

/**
 * Builds a guard for a route.
 *
 * @param c           Hono context
 * @param opts.roles  Allowlist of roles. Omit to allow any authenticated role
 *                    (still requires a valid token).
 * @param opts.allowUnauthenticated  For routes that are public by design but
 *                    still want the user when present (e.g. school-profile).
 */
export function requireSession(opts: { roles?: readonly Role[]; allowUnauthenticated?: boolean } = {}) {
  return async function guard(c: any): Promise<GuardResult> {
    const authUser = await getAuthUser(c);
    const db = getDB(c);

    if (!authUser) {
      if (opts.allowUnauthenticated) {
        return {
          ok: true,
          user: { id: '', email: '', role: 'Student', schoolId: '', raw: null },
          schoolId: getRequestSchoolId(c, null),
          db,
        };
      }
      return { ok: false, response: deny(c, 'लॉगिन आवश्यक है।', 401) };
    }

    // getRequestSchoolId pins dedicated workers to env.SCHOOL_ID and only honours
    // X-School-Id for SuperAdmin on the shared worker.
    const schoolId = getRequestSchoolId(c, authUser);

    const role = normalizeRole(authUser.role);
    if (!role) {
      return { ok: false, response: deny(c, 'भूमिका (role) अमान्य है। कृपया दोबारा लॉगिन करें।') };
    }

    if (opts.roles && opts.roles.length > 0 && !opts.roles.includes(role)) {
      return { ok: false, response: deny(c, 'आपको इस कार्य की अनुमति नहीं है।') };
    }

    return {
      ok: true,
      user: {
        id: String(authUser.sub || ''),
        email: String(authUser.email || ''),
        role,
        schoolId,
        raw: authUser,
      },
      schoolId,
      db,
    };
  };
}

/** Convenience: allowlist for school management roles. */
export const requireManagement = () =>
  requireSession({ roles: ['Director', 'Principal'] as Role[] });

/** Convenience: management + teaching roles. */
export const requireStaffOrAbove = () =>
  requireSession({ roles: ['Director', 'Principal', 'Staff', 'Teacher'] as Role[] });

/**
 * Asserts a teaching user (Staff/Teacher) is the assigned class teacher for the
 * target class. Management roles bypass this.
 *
 * NOTE: this checks the TARGET class only. Callers that allow a user to move a
 * record must also verify the SOURCE class, otherwise a teacher can relocate a
 * student out of a class they do not own.
 */
export async function requireClassTeacherAccess(
  c: any,
  ctx: Extract<GuardResult, { ok: true }>,
  className: string,
): Promise<Response | null> {
  if (isManagement(ctx.user.role)) return null;
  if (!isTeaching(ctx.user.role)) {
    return deny(c, 'आपको इस कार्य की अनुमति नहीं है।');
  }
  const ok = await isClassTeacher(ctx.db, ctx.schoolId, className, ctx.user.id);
  if (!ok) {
    return deny(
      c,
      `केवल अधिकृत कक्षा अध्यापक या प्रधानाचार्य/निदेशक ही कक्षा "${className}" में यह कार्य कर सकते हैं।`,
    );
  }
  return null;
}

export { isClassTeacher, getAssignedClassNames };

/**
 * Parent/Student ownership scoping.
 *
 * Returns the set of student ids the caller is allowed to act on, or null when
 * the caller is not a family role (in which case class/tenant scoping applies
 * instead).
 *
 * Backed by parent_student_links (migration 0039). If the table is not present
 * yet, family roles get an EMPTY set rather than "everything" — a missing table
 * must fail closed, never open.
 */
export async function getFamilyStudentScope(
  ctx: Extract<GuardResult, { ok: true }>,
): Promise<Set<string> | null> {
  if (!isFamily(ctx.user.role)) return null;
  if (!ctx.user.id) return new Set<string>();

  try {
    const rows = await ctx.db
      .prepare('SELECT student_id FROM parent_student_links WHERE school_id = ? AND parent_user_id = ?')
      .bind(ctx.schoolId, ctx.user.id)
      .all();
    return new Set<string>((rows.results || []).map((r: any) => String(r.student_id)));
  } catch (_) {
    // Table missing (pre-0039) or query failed: fail closed.
    return new Set<string>();
  }
}

/** True when the caller may touch this student given family scoping. */
export async function canActOnStudent(
  ctx: Extract<GuardResult, { ok: true }>,
  studentId: string,
): Promise<boolean> {
  const scope = await getFamilyStudentScope(ctx);
  if (scope === null) return true; // not a family role
  return scope.has(String(studentId));
}

/**
 * Field-level redaction.
 *
 * Aadhaar, bank details and salary must not be returned to roles that have no
 * operational need for them. Rather than relying on the UI to hide columns, the
 * API strips them from the payload.
 *
 * `reveal` should only be true for a detail endpoint that has already passed a
 * management-only guard.
 */
const SENSITIVE_FIELDS = [
  'aadhaar_number',
  'aadhaarNumber',
  'bank_account_no',
  'bankAccountNo',
  'ifsc_code',
  'ifscCode',
  'salary',
  'recipientToken',
  'recipient_token',
  'password_hash',
  'passwordHash',
  'gemini_api_key',
  'geminiApiKey',
];

export function redactForRole<T extends Record<string, any>>(row: T, role: any, reveal = false): T {
  if (reveal || isManagement(role)) return row;
  const out: Record<string, any> = { ...row };
  for (const field of SENSITIVE_FIELDS) {
    if (field in out) out[field] = null;
  }
  return out as T;
}

export function redactListForRole<T extends Record<string, any>>(rows: T[], role: any, reveal = false): T[] {
  if (reveal || isManagement(role)) return rows;
  return (rows || []).map((r) => redactForRole(r, role, false));
}
