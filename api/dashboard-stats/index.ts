import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const dashboardStatsApp = new Hono();

dashboardStatsApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const today = new Date().toISOString().split('T')[0];

  const tStudents = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ?').bind(schoolId).first();
  const tActive = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').first();
  const tStaff = await db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE school_id = ?').bind(schoolId).first();
  const tNotices = await db.prepare('SELECT COUNT(*) AS n FROM notices WHERE school_id = ?').bind(schoolId).first();

  const aRows = await db.prepare('SELECT status FROM attendance WHERE school_id = ? AND date = ?').bind(schoolId, today).all();
  const att = aRows.results || [];
  const presentCount = att.filter((a) => a.status === 'Present').length;
  const absentCount = att.filter((a) => a.status === 'Absent').length;
  const attendanceRate = att.length > 0 ? Math.round((presentCount / att.length) * 100) : 0;

  const fRows = await db.prepare('SELECT total_amount, paid_amount FROM fee_invoices WHERE school_id = ?').bind(schoolId).all();
  const fees = fRows.results || [];
  const totalFeeCollected = fees.reduce((acc, f) => acc + (f.paid_amount || 0), 0);
  const totalFeeDue = fees.reduce((acc, f) => acc + (f.total_amount || 0), 0);

  return c.json({
    success: true,
    stats: {
      totalStudents: tStudents ? tStudents.n : 0,
      activeStudents: tActive ? tActive.n : 0,
      totalStaff: tStaff ? tStaff.n : 0,
      attendanceRate,
      todayPresent: presentCount,
      todayAbsent: absentCount,
      attendanceRecordedToday: att.length > 0,
      totalFeeCollected,
      totalFeeDue,
      activeNoticesCount: tNotices ? tNotices.n : 0,
    },
  });
});

export default dashboardStatsApp;
