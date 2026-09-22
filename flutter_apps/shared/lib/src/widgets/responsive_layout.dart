import 'package:flutter/material.dart';
import '../models/user_model.dart';

/// Breakpoint-based responsive layout helper.
/// Mobile: < 768px, Tablet: 768–1024px, Desktop: > 1024px
class ResponsiveLayout extends StatelessWidget {
  final Widget mobile;
  final Widget? tablet;
  final Widget desktop;

  const ResponsiveLayout({
    super.key,
    required this.mobile,
    this.tablet,
    required this.desktop,
  });

  static bool isMobile(BuildContext context) =>
      MediaQuery.sizeOf(context).width < 768;

  static bool isTablet(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return w >= 768 && w < 1024;
  }

  static bool isDesktop(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= 1024;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 1024) {
          return desktop;
        } else if (constraints.maxWidth >= 768) {
          return tablet ?? desktop;
        }
        return mobile;
      },
    );
  }
}

/// A shell widget for desktop/web that provides a sidebar + content area.
class WebShell extends StatefulWidget {
  final UserModel? user;
  final int selectedIndex;
  final List<WebShellItem> items;
  final ValueChanged<int> onIndexChanged;
  final Color sidebarColor;

  const WebShell({
    super.key,
    this.user,
    required this.selectedIndex,
    required this.items,
    required this.onIndexChanged,
    this.sidebarColor = const Color(0xFF0F172A),
  });

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Sidebar
          Container(
            width: 260,
            decoration: BoxDecoration(
              color: widget.sidebarColor,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 8,
                  offset: const Offset(2, 0),
                ),
              ],
            ),
            child: Column(
              children: [
                // App branding
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.school, color: Colors.white, size: 24),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Pragnya Mitra', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                            Text('School Management', style: TextStyle(color: Colors.white54, fontSize: 10)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (widget.user != null) ...[
                  Divider(color: Colors.white.withValues(alpha: 0.1), height: 1),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 18,
                          backgroundColor: Colors.white.withValues(alpha: 0.15),
                          child: Text(
                            widget.user!.fullName.isNotEmpty ? widget.user!.fullName[0].toUpperCase() : '?',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.user!.fullName, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                              Text(widget.user!.role.name.toUpperCase(), style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 10)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                Divider(color: Colors.white.withValues(alpha: 0.1), height: 1),
                const SizedBox(height: 8),
                // Navigation items
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    itemCount: widget.items.length,
                    itemBuilder: (context, index) {
                      final item = widget.items[index];
                      final isSelected = widget.selectedIndex == index;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: Material(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(10),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(10),
                            onTap: () => widget.onIndexChanged(index),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                              decoration: BoxDecoration(
                                color: isSelected ? Colors.white.withValues(alpha: 0.12) : Colors.transparent,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(
                                children: [
                                  Icon(item.icon, size: 20, color: isSelected ? Colors.white : Colors.white54),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      item.label,
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                                        color: isSelected ? Colors.white : Colors.white70,
                                      ),
                                    ),
                                  ),
                                  if (item.badge != null)
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: item.badgeColor ?? Colors.red,
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text('${item.badge}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          // Content area
          Expanded(
            child: widget.items[widget.selectedIndex].child,
          ),
        ],
      ),
    );
  }
}

class WebShellItem {
  final String label;
  final IconData icon;
  final Widget child;
  final int? badge;
  final Color? badgeColor;

  const WebShellItem({
    required this.label,
    required this.icon,
    required this.child,
    this.badge,
    this.badgeColor,
  });
}
