class StudentModel {
  final String id;
  final String scholarNumber;
  final String rollNumber;
  final String fullName;
  final String fatherName;
  final String? fatherOccupation;
  final String? motherName;
  final String className;
  final String? section;
  final String? dob;
  final String? gender;
  final String? category;
  final String? religion;
  final String? aadhaarNumber;
  final String? samagraId;
  final String? bloodGroup;
  final String? parentPhone;
  final String? whatsappNumber;
  final String? email;
  final String? currentAddress;
  final String? permanentAddress;
  final String? previousSchool;
  final String? previousTcNo;
  final String? admissionDate;
  final String? bankAccountNo;
  final String? bankName;
  final String? ifscCode;
  final String status;
  final String? tcIssueDate;
  final String? remarks;

  StudentModel({
    required this.id,
    required this.scholarNumber,
    required this.rollNumber,
    required this.fullName,
    required this.fatherName,
    this.fatherOccupation,
    this.motherName,
    required this.className,
    this.section,
    this.dob,
    this.gender,
    this.category,
    this.religion,
    this.aadhaarNumber,
    this.samagraId,
    this.bloodGroup,
    this.parentPhone,
    this.whatsappNumber,
    this.email,
    this.currentAddress,
    this.permanentAddress,
    this.previousSchool,
    this.previousTcNo,
    this.admissionDate,
    this.bankAccountNo,
    this.bankName,
    this.ifscCode,
    required this.status,
    this.tcIssueDate,
    this.remarks,
  });

  factory StudentModel.fromJson(Map<String, dynamic> json) {
    return StudentModel(
      id: json['id']?.toString() ?? '',
      scholarNumber: json['scholarNumber']?.toString() ?? '',
      rollNumber: json['rollNumber']?.toString() ?? '',
      fullName: json['fullName'] ?? json['name'] ?? '',
      fatherName: json['fatherName'] ?? json['parentName'] ?? '',
      fatherOccupation: json['fatherOccupation']?.toString(),
      motherName: json['motherName']?.toString(),
      className: json['className'] ?? json['currentClass'] ?? '',
      section: json['section']?.toString(),
      dob: json['dob']?.toString(),
      gender: json['gender']?.toString(),
      category: json['category']?.toString(),
      religion: json['religion']?.toString(),
      aadhaarNumber: json['aadhaarNumber']?.toString(),
      samagraId: json['samagraId']?.toString(),
      bloodGroup: json['bloodGroup']?.toString(),
      parentPhone: json['parentPhone']?.toString(),
      whatsappNumber: json['whatsappNumber']?.toString(),
      email: json['email']?.toString(),
      currentAddress: json['currentAddress']?.toString(),
      permanentAddress: json['permanentAddress']?.toString(),
      previousSchool: json['previousSchool']?.toString(),
      previousTcNo: json['previousTcNo']?.toString(),
      admissionDate: json['admissionDate']?.toString(),
      bankAccountNo: json['bankAccountNo']?.toString(),
      bankName: json['bankName']?.toString(),
      ifscCode: json['ifscCode']?.toString(),
      status: json['status'] ?? 'Active',
      tcIssueDate: json['tcIssueDate']?.toString(),
      remarks: json['remarks']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'fullName': fullName,
      'fatherName': fatherName,
      'className': className,
      'section': section,
      'scholarNumber': scholarNumber,
      'rollNumber': rollNumber,
      'dob': dob,
      'gender': gender,
      'category': category,
      'religion': religion,
      'aadhaarNumber': aadhaarNumber,
      'samagraId': samagraId,
      'bloodGroup': bloodGroup,
      'parentPhone': parentPhone,
      'whatsappNumber': whatsappNumber,
      'email': email,
      'currentAddress': currentAddress,
      'permanentAddress': permanentAddress,
      'motherName': motherName,
      'fatherOccupation': fatherOccupation,
      'status': status,
    };
  }
}
