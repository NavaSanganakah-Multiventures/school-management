-- Migration: 0030_exam_improvements.sql
-- Description: Improve exam system with proper subject mapping, template support, and enhanced marks tracking

-- 1. Add template_id and other fields to exams table
ALTER TABLE exams ADD COLUMN template_id TEXT DEFAULT 'template_cbse';
ALTER TABLE exams ADD COLUMN class_name TEXT;
ALTER TABLE exams ADD COLUMN section TEXT;
ALTER TABLE exams ADD COLUMN created_by_user_id TEXT;
ALTER TABLE exams ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE exams ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Create exam_subjects table for proper subject-exam mapping
CREATE TABLE IF NOT EXISTS exam_subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    max_marks REAL DEFAULT 100,
    passing_marks REAL DEFAULT 33,
    subject_type TEXT DEFAULT 'Theory' CHECK(subject_type IN ('Theory', 'Practical', 'Co-Scholastic')),
    weightage_percent REAL DEFAULT 100,
    is_optional INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- 3. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_subjects_school ON exam_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON exam_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_marks_exam ON exam_marks(exam_id);

-- 4. Add created_at to exam_marks if not exists
ALTER TABLE exam_marks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE exam_marks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE exam_marks ADD COLUMN entered_by_user_id TEXT;

-- 5. Create report card templates table
CREATE TABLE IF NOT EXISTS report_card_templates (
    id TEXT PRIMARY KEY,
    template_name TEXT NOT NULL,
    template_type TEXT NOT NULL CHECK(template_type IN ('CBSE', 'STATE_BOARD', 'MODERN', 'CUSTOM')),
    description TEXT,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    header_config TEXT, -- JSON string for header customization
    footer_config TEXT, -- JSON string for footer customization
    layout_config TEXT, -- JSON string for layout settings
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Insert default templates
INSERT OR IGNORE INTO report_card_templates (id, template_name, template_type, description, is_default, is_active, header_config, footer_config, layout_config) VALUES
('template_cbse', 'CBSE Standard Marksheet', 'CBSE', 'CBSE बोर्ड मानक मार्कशीट डिज़ाइन - ग्रेड प्रणाली के साथ', 1, 1, 
'{"showLogo": true, "showAffiliation": true, "schoolNameStyle": "bold", "colorScheme": "blue"}',
'{"showSignatures": true, "signatureCount": 3, "showSeal": true}',
'{"tableStyle": "bordered", "gradeColumn": true, "remarksColumn": true, "showPercentage": true}'),

('template_state', 'State Board Marksheet', 'STATE_BOARD', 'राज्य शिक्षा मंडल मार्कशीट - परंपरागत शैली', 0, 1,
'{"showLogo": true, "showAffiliation": true, "schoolNameStyle": "traditional", "colorScheme": "green"}',
'{"showSignatures": true, "signatureCount": 3, "showSeal": true}',
'{"tableStyle": "classic", "gradeColumn": true, "remarksColumn": true, "showPercentage": true}'),

('template_modern', 'Modern Digital Marksheet', 'MODERN', 'आधुनिक डिजिटल मार्कशीट - QR कोड और ग्राफ के साथ', 0, 1,
'{"showLogo": true, "showAffiliation": false, "schoolNameStyle": "modern", "colorScheme": "gradient"}',
'{"showSignatures": true, "signatureCount": 2, "showSeal": false, "showQRCode": true}',
'{"tableStyle": "modern", "gradeColumn": true, "remarksColumn": false, "showPercentage": true, "showGraph": true}'),

('template_minimal', 'Minimal Clean Marksheet', 'CUSTOM', 'सरल और स्वच्छ मार्कशीट डिज़ाइन', 0, 1,
'{"showLogo": false, "showAffiliation": false, "schoolNameStyle": "minimal", "colorScheme": "grayscale"}',
'{"showSignatures": true, "signatureCount": 2, "showSeal": false}',
'{"tableStyle": "minimal", "gradeColumn": true, "remarksColumn": false, "showPercentage": true}');

-- 7. Create school template preferences
CREATE TABLE IF NOT EXISTS school_preferences (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL UNIQUE,
    default_report_template_id TEXT DEFAULT 'template_cbse',
    school_logo_url TEXT,
    school_seal_url TEXT,
    custom_header TEXT,
    custom_footer TEXT,
    show_attendance_in_report INTEGER DEFAULT 0,
    show_remarks_in_report INTEGER DEFAULT 1,
    auto_calculate_grades INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id),
    FOREIGN KEY (default_report_template_id) REFERENCES report_card_templates(id)
);

-- 8. Create result analytics snapshot table (for performance)
CREATE TABLE IF NOT EXISTS result_analytics (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    exam_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    section TEXT,
    total_students INTEGER DEFAULT 0,
    students_appeared INTEGER DEFAULT 0,
    students_passed INTEGER DEFAULT 0,
    pass_percentage REAL DEFAULT 0,
    average_percentage REAL DEFAULT 0,
    highest_marks REAL DEFAULT 0,
    lowest_marks REAL DEFAULT 0,
    topper_student_id TEXT,
    subject_wise_data TEXT, -- JSON for subject-wise analysis
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id),
    FOREIGN KEY (exam_id) REFERENCES exams(id)
);

CREATE INDEX IF NOT EXISTS idx_result_analytics_exam ON result_analytics(exam_id);
CREATE INDEX IF NOT EXISTS idx_result_analytics_class ON result_analytics(class_name);
