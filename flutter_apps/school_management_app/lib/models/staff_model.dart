class StaffModel {
  final String id;
  final String? employeeCode;
  final String name;
  final String? designation;
  final String? department;
  final String? subject;
  final String? phone;
  final String? email;
  final String? qualification;
  final String? salary;
  final String status;
  final String? joiningDate;
  final bool? hasLogin;
  final bool? passwordSet;
  final String? username;

  StaffModel({
    required this.id,
    this.employeeCode,
    required this.name,
    this.designation,
    this.department,
    this.subject,
    this.phone,
    this.email,
    this.qualification,
    this.salary,
    required this.status,
    this.joiningDate,
    this.hasLogin,
    this.passwordSet,
    this.username,
  });

  factory StaffModel.fromJson(Map<String, dynamic> json) {
    return StaffModel(
      id: json['id']?.toString() ?? '',
      employeeCode: json['employeeCode']?.toString(),
      name: json['name'] ?? '',
      designation: json['designation']?.toString(),
      department: json['department']?.toString(),
      subject: json['subject']?.toString(),
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      qualification: json['qualification']?.toString(),
      salary: json['salary']?.toString(),
      status: json['status'] ?? 'Active',
      joiningDate: json['joiningDate']?.toString(),
      hasLogin: json['hasLogin'] == true,
      passwordSet: json['passwordSet'] == true,
      username: json['username']?.toString(),
    );
  }
}

class ClassModel {
  final String className;
  final String? classTeacherUserId;
  final String? classTeacherName;
  final String? classTeacherEmail;

  ClassModel({
    required this.className,
    this.classTeacherUserId,
    this.classTeacherName,
    this.classTeacherEmail,
  });

  factory ClassModel.fromJson(Map<String, dynamic> json) {
    return ClassModel(
      className: json['className'] ?? '',
      classTeacherUserId: json['classTeacherUserId']?.toString(),
      classTeacherName: json['classTeacherName']?.toString(),
      classTeacherEmail: json['classTeacherEmail']?.toString(),
    );
  }
}
