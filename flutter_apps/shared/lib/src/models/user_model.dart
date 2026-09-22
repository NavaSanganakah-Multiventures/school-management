enum UserRole {
  director,
  principal,
  staff,
  superAdmin,
  parents,
  students,
}

UserRole parseUserRole(String? roleStr) {
  final clean = (roleStr ?? '').trim().toLowerCase();
  if (clean == 'director') return UserRole.director;
  if (clean == 'principal') return UserRole.principal;
  if (clean == 'superadmin') return UserRole.superAdmin;
  if (clean == 'parents' || clean == 'parent') return UserRole.parents;
  if (clean == 'students' || clean == 'student') return UserRole.students;
  if (clean == 'staff' || clean == 'teacher') return UserRole.staff;
  // Fail closed: the backend's system_users CHECK constraint only allows the
  // roles handled above ('Director', 'Principal', 'Staff', 'Parents',
  // 'Students' + platform 'SuperAdmin'), so anything else is a contract
  // violation — a wrong/custom server, data corruption, or a backend
  // migration this client does not know yet. Silently mapping it to staff
  // would hand out teacher-level permissions (leave approval, marks, LMS),
  // so refuse instead. Every caller already handles this safely: login
  // surfaces the message, session restore and profile refresh fall back
  // to /login.
  throw FormatException(
    'अस्वीकृत भूमिका: "${roleStr ?? ''}" — कृपया ऐप अपडेट करें या सपोर्ट से संपर्क करें।',
  );
}

String roleToDisplayName(UserRole role) {
  switch (role) {
    case UserRole.director:
      return 'निदेशक (Director)';
    case UserRole.principal:
      return 'प्रधानाचार्य (Principal)';
    case UserRole.staff:
      return 'शिक्षक / स्टाफ (Teacher)';
    case UserRole.superAdmin:
      return 'सुपर एडमिन (Super Admin)';
    case UserRole.parents:
      return 'अभिभावक (Parent)';
    case UserRole.students:
      return 'विद्यार्थी (Student)';
  }
}

class UserModel {
  final String id;
  final String fullName;
  final String email;
  final String? phone;
  final UserRole role;
  final String? designation;
  final String? department;
  final String schoolId;

  UserModel({
    required this.id,
    required this.fullName,
    required this.email,
    this.phone,
    required this.role,
    this.designation,
    this.department,
    required this.schoolId,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id']?.toString() ?? '',
      fullName: json['fullName'] ?? json['full_name'] ?? 'उपयोगकर्ता',
      email: json['email'] ?? '',
      phone: json['phone'],
      role: parseUserRole(json['role']),
      designation: json['designation'],
      department: json['department'],
      schoolId: json['schoolId'] ?? json['school_id'] ?? 'school-01',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'fullName': fullName,
      'email': email,
      'phone': phone,
      'role': role.name,
      'designation': designation,
      'department': department,
      'schoolId': schoolId,
    };
  }

  // ── Centralized role-policy predicates (single source of truth) ────────
  /// Director or Principal — academic + administrative management.
  bool get isAdminRole => role == UserRole.director || role == UserRole.principal;

  /// Director or Principal or Staff — can approve leave / enter marks / manage LMS.
  bool get canManageAcademics => role == UserRole.director || role == UserRole.principal || role == UserRole.staff;

  /// Director only — school profile, billing, principal change, delete staff.
  bool get isDirector => role == UserRole.director;

  /// Whether this user can edit school profile.
  bool get canEditSchoolProfile => role == UserRole.director;

  /// Whether this user can manage billing/subscription.
  bool get canManageBilling => role == UserRole.director;

  /// Whether this user can manage staff (add/delete/assign class teacher).
  bool get canManageStaff => role == UserRole.director || role == UserRole.principal;
}
