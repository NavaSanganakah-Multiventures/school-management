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
  return UserRole.staff;
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
}
