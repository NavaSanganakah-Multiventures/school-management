class SchoolProfileModel {
  final String? id;
  final String schoolName;
  final String? affiliationNumber;
  final String? boardName;
  final String? schoolCode;
  final String? email;
  final String? phone;
  final String? alternatePhone;
  final String? address;
  final String? city;
  final String? state;
  final String? pincode;
  final String? academicSession;
  final String? directorName;
  final String? principalName;
  final String? logoUrl;
  final String? updatedAt;

  SchoolProfileModel({
    this.id,
    required this.schoolName,
    this.affiliationNumber,
    this.boardName,
    this.schoolCode,
    this.email,
    this.phone,
    this.alternatePhone,
    this.address,
    this.city,
    this.state,
    this.pincode,
    this.academicSession,
    this.directorName,
    this.principalName,
    this.logoUrl,
    this.updatedAt,
  });

  factory SchoolProfileModel.fromJson(Map<String, dynamic> json) {
    return SchoolProfileModel(
      id: json['id']?.toString(),
      schoolName: json['schoolName'] ?? '',
      affiliationNumber: json['affiliationNumber']?.toString(),
      boardName: json['boardName']?.toString(),
      schoolCode: json['schoolCode']?.toString(),
      email: json['email']?.toString(),
      phone: json['phone']?.toString(),
      alternatePhone: json['alternatePhone']?.toString(),
      address: json['address']?.toString(),
      city: json['city']?.toString(),
      state: json['state']?.toString(),
      pincode: json['pincode']?.toString(),
      academicSession: json['academicSession']?.toString(),
      directorName: json['directorName']?.toString(),
      principalName: json['principalName']?.toString(),
      logoUrl: json['logoUrl']?.toString(),
      updatedAt: json['updatedAt']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'schoolName': schoolName,
        'affiliationNumber': affiliationNumber,
        'boardName': boardName,
        'schoolCode': schoolCode,
        'email': email,
        'phone': phone,
        'alternatePhone': alternatePhone,
        'address': address,
        'city': city,
        'state': state,
        'pincode': pincode,
        'academicSession': academicSession,
        'directorName': directorName,
        'principalName': principalName,
      };
}
