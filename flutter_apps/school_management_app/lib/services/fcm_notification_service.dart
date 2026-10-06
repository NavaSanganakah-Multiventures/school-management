import 'dart:async';

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

  // Topics this device is currently subscribed to, and the listeners it owns.
  //
  // `init` is called on EVERY successful login (screens/login_screen.dart), so without
  // this the service was appending to itself: after N logins the token-refresh and
  // onMessage listeners were registered N times, so every foreground push was displayed
  // N times. And because nothing ever called `unsubscribeFromTopic`, signing out of
  // School A and into School B left the device subscribed to school_A_all and
  // school_A_parents — so the phone kept receiving the previous school's attendance and
  // absentee alerts through the new session.
  final Set<String> _subscribedTopics = <String>{};
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _messageSub;

  /// Topics for a user, derived the same way in both directions so that
  /// [unsubscribeAll] can always reverse what [_registerDeviceToken] did.
  static List<String> topicsFor(UserModel user) {
    final roleTopic = user.role == UserRole.parents
        ? 'school_${user.schoolId}_parents'
        : (user.role == UserRole.students
            ? 'school_${user.schoolId}_students'
            : 'school_${user.schoolId}_teachers');
    return ['school_${user.schoolId}_all', roleTopic];
  }

  /// Leaves every topic this device joined, and detaches the listeners.
  ///
  /// Must be called on logout, otherwise the next tenant's session still receives this
  /// school's broadcasts.
  Future<void> unsubscribeAll() async {
    final fcm = _fcm;
    if (fcm != null && _subscribedTopics.isNotEmpty) {
      for (final t in _subscribedTopics) {
        try {
          await fcm.unsubscribeFromTopic(t);
        } catch (_) {
          // Best effort: a topic that cannot be left must not block logout.
        }
      }
    }
    _subscribedTopics.clear();

    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;
    await _messageSub?.cancel();
    _messageSub = null;
  }

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

        // Listeners are replace, not append. init() runs once per login, and the
        // previous subscription is cancelled first so a relogin does not double every
        // notification.
        await _tokenRefreshSub?.cancel();
        _tokenRefreshSub = fcm.onTokenRefresh.listen((newToken) {
          _registerDeviceToken(newToken, user);
        });

        await _messageSub?.cancel();
        _messageSub = FirebaseMessaging.onMessage.listen((RemoteMessage message) {
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
      final topics = topicsFor(user);

      // Subscribe FCM topic on device
      if (fcm != null) {
        for (final t in topics) {
          await fcm.subscribeToTopic(t);
          _subscribedTopics.add(t);
        }
      }

      // Register with Pragnya Mitra backend
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
            'pragnya_alerts',
            'Pragnya Mitra Alerts',
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
