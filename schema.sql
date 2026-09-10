-- Cloudflare D1 Database Schema for VidyaSetu School Management System & CRM
-- Database: Cloudflare D1 (SQLite-compatible)
-- Roles: Director (Super Admin), Principal (Academic Head), Staff (Teachers)

-- 1. School Profile & Settings Table
CREATE TABLE IF NOT EXISTS school_profile (
    id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL,
    affiliation_number TEXT,        -- e.g. "CBSE/AFF/2026/89412"
    board_name TEXT DEFAULT 'CBSE',  -- CBSE / ICSE / State Board
    school_code TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    academic_session TEXT DEFAULT '2026-2027',
    director_name TEXT NOT NULL,
    principal_name TEXT NOT NULL,
    logo_url TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. CRM Users Table (Director, Principal, Staff)
CREATE TABLE IF NOT EXISTS system_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Director', 'Principal', 'Staff')),
    designation TEXT NOT NULL,
    department TEXT,
    qualification TEXT,
    salary REAL DEFAULT 0,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Principal Appointment & History Table (For Director to track/change principals)
CREATE TABLE IF NOT EXISTS principal_history (
    id TEXT PRIMARY KEY,
    principal_user_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    qualification TEXT,
    appointed_date TEXT NOT NULL,
    relieved_date TEXT,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Past')),
    appointed_by TEXT DEFAULT 'Director',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Classes Table
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,          -- e.g. "Class 10"
    section TEXT NOT NULL,       -- e.g. "A"
    stream TEXT,                 -- e.g. "Science", "Commerce", "General"
    room_number TEXT,
    class_teacher_id TEXT,
    class_teacher_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Comprehensive Students Table (Full Scholar Register / दाखिला-खारिज रजिस्टर)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    scholar_number TEXT UNIQUE NOT NULL, -- स्कॉलर क्रमांक (SR No. e.g. "SR-2026/0142")
    roll_number TEXT NOT NULL,           -- रोल नंबर
    full_name TEXT NOT NULL,             -- विद्यार्थी का नाम
    father_name TEXT NOT NULL,           -- पिता का नाम
    father_occupation TEXT,              -- पिता का व्यवसाय
    mother_name TEXT NOT NULL,           -- माता का नाम
    class_name TEXT NOT NULL,            -- कक्षा
    section TEXT NOT NULL,               -- सेक्शन / वर्ग
    dob TEXT NOT NULL,                   -- जन्म तिथि (YYYY-MM-DD)
    gender TEXT CHECK(gender IN ('Male', 'Female', 'Other')),
    category TEXT DEFAULT 'General',     -- General / OBC / SC / ST / EWS
    religion TEXT DEFAULT 'Hindu',       -- धर्म
    aadhaar_number TEXT,                 -- आधार कार्ड नंबर (12 अंक)
    samagra_id TEXT,                     -- समग्र आईडी / परिवार आईडी
    blood_group TEXT,                    -- ब्लड ग्रुप
    parent_phone TEXT NOT NULL,          -- अभिभावक का फोन नंबर
    whatsapp_number TEXT,                -- व्हाट्सएप नंबर
    email TEXT,                          -- ईमेल
    current_address TEXT NOT NULL,       -- वर्तमान पता
    permanent_address TEXT,              -- स्थायी पता
    previous_school TEXT,                -- पूर्व विद्यालय का नाम
    previous_tc_no TEXT,                 -- पूर्व टीसी क्रमांक
    admission_date TEXT NOT NULL,        -- प्रवेश दिनांक
    bank_account_no TEXT,                -- छात्र/अभिभावक बैंक खाता संख्या
    bank_name TEXT,                      -- बैंक का नाम
    ifsc_code TEXT,                      -- IFSC कोड
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'TC_Issued', 'Suspended', 'Passed_Out')),
    tc_issue_date TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Teachers & Staff Table
CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    employee_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,           -- PGT, TGT, PRT, Lab Assistant, Accountant
    department TEXT NOT NULL,
    subject_specialization TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    qualification TEXT,
    salary REAL DEFAULT 0,
    joining_date TEXT,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Attendance Table (कक्षावार दैनिक उपस्थिति)
CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,                  -- YYYY-MM-DD
    status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Leave')),
    remarks TEXT,
    marked_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 8. Fee Invoices Table (फीस चालान व रसीदें)
CREATE TABLE IF NOT EXISTS fee_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    scholar_number TEXT,
    class_name TEXT NOT NULL,
    title TEXT NOT NULL,                 -- e.g. "प्रथम तिमाही शिक्षण शुल्क 2026-27"
    total_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    due_date TEXT NOT NULL,
    status TEXT DEFAULT 'Unpaid' CHECK(status IN ('Paid', 'Partial', 'Unpaid', 'Overdue')),
    payment_method TEXT,                 -- Cash, UPI, Net Banking, Cheque
    transaction_id TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 9. Exams & Marks Table
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    exam_name TEXT NOT NULL,             -- e.g. "अर्धवार्षिक परीक्षा (Half Yearly 2026)"
    academic_year TEXT NOT NULL,
    term TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS exam_marks (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    max_marks REAL DEFAULT 100,
    marks_obtained REAL NOT NULL,
    grade TEXT,
    remarks TEXT,
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 10. Notices & Announcements Table (स्कूल नोटिस बोर्ड)
CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'General' CHECK(category IN ('General', 'Academic', 'Holiday', 'Exam', 'Sports', 'Emergency')),
    target_audience TEXT DEFAULT 'All' CHECK(target_audience IN ('All', 'Students', 'Teachers', 'Parents')),
    published_by TEXT NOT NULL,
    published_date TEXT DEFAULT CURRENT_DATE,
    priority TEXT DEFAULT 'Normal' CHECK(priority IN ('Low', 'Normal', 'High', 'Urgent')),
    fcm_broadcast_status TEXT DEFAULT 'Sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Notifications Log (Firebase Cloud Messaging / FCM integration)
CREATE TABLE IF NOT EXISTS notifications_log (
    id TEXT PRIMARY KEY,
    fcm_message_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_topic TEXT,                   -- e.g. "school_parents", "class_10"
    recipient_token TEXT,
    delivery_status TEXT DEFAULT 'Success',
    payload_data TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
