-- Migration: 0022_plugin_lms.sql
-- Description: Register LMS (Learning Management System) Plugin and create school-scoped tables

-- 1. Register LMS Plugin in the global plugins catalog
INSERT OR IGNORE INTO plugins (id, name, description, type, price, is_active)
VALUES (
  'plugin-lms',
  'LMS एवं डिजिटल क्लासरूम (Learning Management System)',
  'ऑनलाइन पाठ्य सामग्री, वीडियो लेक्चर्स, असाइनमेंट सबमिशन, क्विज़ और डिजिटल लर्निंग मॉड्यूल',
  'global',
  499.00,
  1
);

-- 2. LMS Courses Table (School-scoped)
CREATE TABLE IF NOT EXISTS lms_courses (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  class_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  teacher_id TEXT,
  teacher_name TEXT,
  thumbnail_url TEXT,
  is_published INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lms_courses_school ON lms_courses(school_id, class_name);

-- 3. LMS Lessons / Chapters Table (School-scoped)
CREATE TABLE IF NOT EXISTS lms_lessons (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT DEFAULT 'video' CHECK(content_type IN ('video', 'document', 'quiz', 'link')),
  content_url TEXT,
  duration_mins INTEGER DEFAULT 15,
  sequence_order INTEGER DEFAULT 1,
  is_preview INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lms_lessons_course ON lms_lessons(school_id, course_id, sequence_order);

-- 4. LMS Assignments Table (School-scoped)
CREATE TABLE IF NOT EXISTS lms_assignments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  due_date TEXT NOT NULL,
  max_marks INTEGER DEFAULT 100,
  attachment_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lms_assignments_course ON lms_assignments(school_id, course_id);

-- 5. LMS Student Submissions Table (School-scoped)
CREATE TABLE IF NOT EXISTS lms_submissions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  submission_text TEXT,
  attachment_url TEXT,
  status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'graded', 'resubmit_requested')),
  marks_obtained REAL,
  teacher_feedback TEXT,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  graded_at DATETIME,
  FOREIGN KEY (assignment_id) REFERENCES lms_assignments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lms_submissions_assignment ON lms_submissions(school_id, assignment_id, student_id);
