import { Hono } from 'hono';
import {
  studentScholars,
  staffMembers,
  attendanceStore,
  feeInvoices,
  schoolNotices,
} from '../db';

const dashboardStatsApp = new Hono();

dashboardStatsApp.get('/', (c) => {
  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = attendanceStore.filter((a) => a.date === today);
  const presentCount = todayAttendance.filter((a) => a.status === 'Present').length;
  const absentCount = todayAttendance.filter((a) => a.status === 'Absent').length;
  const attendanceRate =
    todayAttendance.length > 0
      ? Math.round((presentCount / todayAttendance.length) * 100)
      : 0;

  const totalFeeCollected = feeInvoices.reduce((acc, f) => acc + (f.paidAmount || 0), 0);
  const totalFeeDue = feeInvoices.reduce((acc, f) => acc + (f.totalAmount || 0), 0);

  return c.json({
    success: true,
    stats: {
      totalStudents: studentScholars.length,
      activeStudents: studentScholars.filter((s) => s.status === 'Active').length,
      totalStaff: staffMembers.length,
      attendanceRate,
      todayPresent: presentCount,
      todayAbsent: absentCount,
      attendanceRecordedToday: todayAttendance.length > 0,
      totalFeeCollected,
      totalFeeDue,
      activeNoticesCount: schoolNotices.length,
    },
  });
});

export default dashboardStatsApp;
