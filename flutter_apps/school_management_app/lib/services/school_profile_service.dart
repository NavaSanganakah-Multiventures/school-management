import 'api_client.dart';
import '../models/school_profile_model.dart';

class SchoolProfileService {
  final _api = ApiClient();

  Future<SchoolProfileModel> getProfile() async {
    final res = await _api.get('/api/school-profile');
    final profile = res['profile'] ?? res;
    return SchoolProfileModel.fromJson(profile as Map<String, dynamic>);
  }

  Future<SchoolProfileModel> updateProfile(Map<String, dynamic> body) async {
    final res = await _api.put('/api/school-profile', body: body);
    final profile = res['profile'] ?? res;
    return SchoolProfileModel.fromJson(profile as Map<String, dynamic>);
  }
}
