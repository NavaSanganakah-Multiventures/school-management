# Plugin Architecture Guidelines

## Overview
This project uses a WordPress-style architecture for Plugins. Plugins are completely decoupled from the core application (`school-crm-shell.tsx`). When an AI agent is tasked with creating a new plugin, it MUST follow these instructions to ensure the frontend and backend are implemented correctly.

## Backend Architecture
1. **Migration File**: Create a SQL migration for the plugin in `db_migrations/` (e.g. `0020_plugin_xyz.sql`). You MUST use `INSERT OR IGNORE INTO plugins (id, name, description, price, features)` to register the plugin in the database.
2. **API Routes**: Create a new folder for the plugin API in `api/` (e.g. `api/my-plugin/index.ts`). Export a Hono app.
3. **API Registration**: Open `api/index.ts` and register the plugin route (e.g. `app.route('/my-plugin', myPluginApp);`).

## Frontend Architecture (WordPress Style)
Do **NOT** modify `components/school-crm-shell.tsx` when adding a new plugin. The shell is designed to dynamically load plugins from the central registry.

To create a frontend plugin:
1. **Create Plugin Folder**: Create a folder for your plugin inside the `plugins/` directory (e.g. `plugins/my-plugin/`).
2. **Create Components**: Build your UI components (Screens, Widgets) inside your plugin folder.
3. **Register the Plugin**: Open `plugins/index.ts` and import your components. Add a new entry to the `PLUGINS_REGISTRY` array.

### Registry Example (`plugins/index.ts`)
```typescript
import { MyPluginScreen } from './my-plugin/screen';
import { MyPluginWidget } from './my-plugin/widget';
import { Puzzle } from 'lucide-react';

export const PLUGINS_REGISTRY: FrontendPlugin[] = [
  {
    id: 'plugin-xyz', // Must exactly match the ID in the database
    navItems: [
      { 
        id: 'my-plugin-tab', 
        label: 'My New Plugin', 
        icon: Puzzle, 
        allowedRoles: ['Director', 'SuperAdmin'], 
        badge: 'New' 
      }
    ],
    routes: [
      { id: 'my-plugin-tab', component: MyPluginScreen }
    ],
    widgets: [
      MyPluginWidget
    ]
  }
]
```

### Dynamic Capabilities
- `navItems`: The sidebar navigation link. It will automatically show up if the plugin is activated by the school.
- `routes`: The full-screen component rendered when the user clicks the corresponding `navItem`. (The `id` must match the `navItems.id`).
- `widgets`: A floating component (e.g. a chat bubble) rendered at the root level of the app.

## Activation Flow
When the school director installs/activates the plugin from the "Plugin Marketplace", the core shell will fetch the active plugins and automatically loop through `PLUGINS_REGISTRY`, injecting your `navItems`, `routes`, and `widgets` into the UI without any hardcoded if-statements.
