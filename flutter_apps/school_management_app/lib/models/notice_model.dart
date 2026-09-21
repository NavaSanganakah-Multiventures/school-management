class NoticeModel {
  final String id;
  final String title;
  final String content;
  final String? category;
  final String? targetAudience;
  final String? publishedBy;
  final String? publishedDate;
  final String? priority;
  final bool? alertSent;

  NoticeModel({
    required this.id,
    required this.title,
    required this.content,
    this.category,
    this.targetAudience,
    this.publishedBy,
    this.publishedDate,
    this.priority,
    this.alertSent,
  });

  factory NoticeModel.fromJson(Map<String, dynamic> json) {
    return NoticeModel(
      id: json['id']?.toString() ?? '',
      title: json['title'] ?? '',
      content: json['content'] ?? '',
      category: json['category']?.toString(),
      targetAudience: json['targetAudience']?.toString(),
      publishedBy: json['publishedBy']?.toString(),
      publishedDate: json['publishedDate']?.toString(),
      priority: json['priority']?.toString(),
      alertSent: json['alertSent'] == true,
    );
  }
}

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
