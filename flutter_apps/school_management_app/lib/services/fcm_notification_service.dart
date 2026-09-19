import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_client.dart';
import '../models/user_model.dart';

class FcmNotificationService {
  static final FcmNotificationService _instance = FcmNotificationService._internal();
  factory FcmNotificationService() => _instance;
  FcmNotificationService._internal();

  FirebaseMessaging? get _fcm {
    try {
      if (Firebase.apps.isNotEmpty) {
        return FirebaseMessaging.instance;
      }
    } catch (_) {}
    return null;
  }

  final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();
  final ApiClient _api = ApiClient();

  Future<void> init(UserModel user) async {
    try {
      final fcm = _fcm;
      if (fcm == null) return;

      // 1. Request notification permission
      NotificationSettings settings = await fcm.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        // 2. Setup local notification channel for Android
        const AndroidInitializationSettings androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
        const InitializationSettings initSettings = InitializationSettings(android: androidSettings);
        await _localNotifications.initialize(initSettings);

        // 3. Obtain real Google FCM device token
        String? token = await fcm.getToken();
        if (token != null) {
          await _registerDeviceToken(token, user);
        }

        // Listen for token refresh
        fcm.onTokenRefresh.listen((newToken) {
          _registerDeviceToken(newToken, user);
        });

        // 4. Foreground notification handling
        FirebaseMessaging.onMessage.listen((RemoteMessage message) {
          _showForegroundNotification(message);
        });
      }
    } catch (_) {
      // Gracefully handle environments without active Google Play Services
    }
  }

  Future<void> _registerDeviceToken(String token, UserModel user) async {
    try {
      final fcm = _fcm;
      final roleTopic = user.role == UserRole.parents
          ? 'school_${user.schoolId}_parents'
          : (user.role == UserRole.students
              ? 'school_${user.schoolId}_students'
              : 'school_${user.schoolId}_teachers');

      final topics = ['school_${user.schoolId}_all', roleTopic];

      // Subscribe FCM topic on device
      if (fcm != null) {
        for (final t in topics) {
          await fcm.subscribeToTopic(t);
        }
      }

      // Register with VidyaSetu backend
      await _api.post('/api/notifications/register-token', body: {
        'token': token,
        'schoolId': user.schoolId,
        'userId': user.id,
        'role': roleToDisplayName(user.role),
        'deviceType': 'mobile_app',
        'platform': 'flutter',
        'topics': topics,
      });
    } catch (e) {
      // Backend registration error logged
    }
  }

  void _showForegroundNotification(RemoteMessage message) {
    RemoteNotification? notification = message.notification;

    if (notification != null) {
      _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'vidyasetu_alerts',
            'VidyaSetu Alerts',
            channelDescription: 'School Attendance and Emergency Notices',
            importance: Importance.max,
            priority: Priority.high,
            icon: '@mipmap/ic_launcher',
          ),
        ),
      );
    }
  }
}
