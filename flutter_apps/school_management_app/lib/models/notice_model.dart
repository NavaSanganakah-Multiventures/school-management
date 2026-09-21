class NotificationHistoryModel {
  final String? id;
  final String title;
  final String body;
  final String? topic;
  final String? targetRole;
  final String? priority;
  final String? sentAt;

  NotificationHistoryModel({
    this.id,
    required this.title,
    required this.body,
    this.topic,
    this.targetRole,
    this.priority,
    this.sentAt,
  });

  factory NotificationHistoryModel.fromJson(Map<String, dynamic> json) {
    return NotificationHistoryModel(
      id: json['id']?.toString(),
      title: json['title'] ?? '',
      body: json['body'] ?? '',
      topic: json['topic']?.toString(),
      targetRole: json['targetRole']?.toString(),
      priority: json['priority']?.toString(),
      sentAt: json['sentAt']?.toString() ?? json['createdAt']?.toString(),
    );
  }
}
