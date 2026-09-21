import { getDB } from '../db';

export type PlatformRole = 'SuperAdmin' | 'Director' | 'Principal' | 'Staff';

export function canManageClassTeachers(role: PlatformRole): boolean {
  return role === 'Director' || role === 'Principal' || role === 'SuperAdmin';
}

export async function isClassTeacher(db: any, schoolId: string, className: string, userId: string): Promise<boolean> {
  if (!className || !userId || !db) return false;
  const row = await db.prepare('SELECT id FROM class_teachers WHERE school_id = ? AND class_name = ? AND teacher_user_id = ?')
    .bind(schoolId, className, userId).first();
  return !!row;
}

export async function getAssignedClassNames(db: any, schoolId: string, userId: string): Promise<string[]> {
  if (!db || !schoolId || !userId) return [];
  const rows = await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name')
    .bind(schoolId, userId).all();
  return (rows.results || []).map((r: any) => r.class_name);
}

export function canMarkAttendance(role: PlatformRole, isClassTeacherForClass: boolean): boolean {
  if (role === 'Director' || role === 'Principal' || role === 'SuperAdmin') return true;
  return role === 'Staff' && isClassTeacherForClass;
}