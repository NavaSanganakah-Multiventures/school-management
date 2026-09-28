import { Hono } from 'hono';
import { getDB } from '../db';
import { requireSession } from '../lib/rbac';
import { SUPER_ADMIN, type Role } from '../lib/roles';

const dashboardStatsApp = new Hono<{ Bindings: any }>();

// WHY THIS IS MANAGEMENT-ONLY
//
// This route called getAuthUser() and nothing else, so any authenticated role
// reached it -- including Parent and Student, the two roles the database has
// allowed since migration 0034 and which the rest of the API goes out of its way
// to scope. It returns:
//
//   totalStudents, activeStudents, totalStaff   -> the shape of the school
//   totalFeeCollected, totalFeeDue              -> school-wide money
//
// api/fees/index.ts:38-42 and :91-95 deliberately suppress school-wide totals for
// family roles, with a comment saying so. This route reintroduced exactly what
// that code was written to withhold, on a route with no role check at all. A
// Parent could read the whole school's fee collection.
//
// WHY REFUSAL RATHER THAN REDACTION
//
// The app does not point any family-role screen here. Parent and Student both
// land on /parent/portal, which reads its own child data and never calls this.
// So redacting "the part a parent is allowed to see" would mean inventing a
// contract nothing consumes, and the honest question -- what SHOULD a Parent see
// in a school-wide fee dashboard? -- has no product answer behind it. Refusing
// is the answer that cannot be wrong.
//
// The alternative, gating the UI, is not available: the repo's own rule is that
// hidden UI is never the control. /analytics, /classes and /students are
// userRoute entries reachable by any logged-in role, so the route guard is the
// only place this can be enforced.
const requireManagement = () =>
  requireSession({ roles: ['Director', 'Principal', SUPER_ADMIN] as Role[] });

dashboardStatsApp.get('/', async (c) => {
  const guard = await requireManagement()(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  if (!schoolId) return c.json({ success: false, message: 'स्कूल संदर्भ (tenant) ज़रूरी है।' }, 401);

  const today = new Date().toISOString().split('T')[0];

  const tStudents = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ?').bind(schoolId).first();
  const tActive = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').first();
  const tStaff = await db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE school_id = ?').bind(schoolId).first();
  const tNotices = await db.prepare('SELECT COUNT(*) AS n FROM notices WHERE school_id = ?').bind(schoolId).first();

  const attRow = await db.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS present, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS absent FROM attendance WHERE school_id = ? AND date = ?').bind('Present', 'Absent', schoolId, today).first();
  const attendanceTotal = attRow ? (attRow.total || 0) : 0;
  const presentCount = attRow ? (attRow.present || 0) : 0;
  const absentCount = attRow ? (attRow.absent || 0) : 0;
  const attendanceRate = attendanceTotal > 0 ? Math.round((presentCount / attendanceTotal) * 100) : 0;

  const fRows = await db.prepare('SELECT total_amount, paid_amount FROM fee_invoices WHERE school_id = ?').bind(schoolId).all();
  const fees = (fRows.results || []) as any[];
  const totalFeeCollected = fees.reduce((acc: number, f: any) => acc + (f.paid_amount || 0), 0);
  const totalFeeDue = fees.reduce((acc: number, f: any) => acc + (f.total_amount || 0), 0);

  return c.json({
    success: true,
    stats: {
      totalStudents: tStudents ? tStudents.n : 0,
      activeStudents: tActive ? tActive.n : 0,
      totalStaff: tStaff ? tStaff.n : 0,
      attendanceRate,
      todayPresent: presentCount,
      todayAbsent: absentCount,
      attendanceRecordedToday: attendanceTotal > 0,
      totalFeeCollected,
      totalFeeDue,
      activeNoticesCount: tNotices ? tNotices.n : 0,
    },
  });
});

export default dashboardStatsApp;
