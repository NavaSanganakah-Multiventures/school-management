class AppConfig {
  // Base URL for the VidyaSetu backend API
  // In development, default to local or Cloudflare worker endpoint
  static const String apiBaseUrl = 'https://school-management.nssite.workers.dev';
  // For local Android emulator: 'http://10.0.2.2:3000'
  // For local physical device: 'http://<YOUR_IP>:3000'

  static const String appName = 'विद्या सेतु (VidyaSetu)';
  static const String appVersion = '1.0.0';
}
