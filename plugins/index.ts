import React from 'react';
import { Sparkles, Bot } from 'lucide-react';
import { AIAssistantScreen } from './ai-assistant/screen';
import { AIAssistantWidget } from './ai-assistant/widget';

export interface FrontendPlugin {
  id: string; // The plugin ID matching the DB (e.g. 'plugin-ai-assistant')
  navItems?: {
    id: string;
    label: string;
    icon: React.ElementType;
    allowedRoles?: ('Director' | 'Principal' | 'Staff' | 'SuperAdmin')[];
    superAdminOnly?: boolean;
    requiredModule?: string;
    badge?: string;
  }[];
  routes?: {
    id: string; // Should match one of the navItem ids if it's a dedicated screen
    component: React.ComponentType<any>;
  }[];
  widgets?: {
    id: string; // Unique identifier for the widget to be used as React key
    component: React.ComponentType<any>;
  }[];
}

export const PLUGINS_REGISTRY: FrontendPlugin[] = [
  {
    id: 'plugin-ai-assistant',
    navItems: [
      { id: 'ai', label: 'विद्या AI असिस्टेंट', icon: Sparkles, allowedRoles: ['Director', 'Principal', 'Staff', 'SuperAdmin'], badge: 'AI' }
    ],
    routes: [
      { id: 'ai', component: AIAssistantScreen }
    ],
    widgets: [
      { id: 'ai-assistant-widget', component: AIAssistantWidget }
    ]
  },
  // Future plugins can be added here
];
