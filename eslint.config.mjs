import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  {
    extends: [...next],
  },
  {
    ignores: [
      ".wrangler/**",
      ".kilo/**",
      ".kiro/**",
      "node_modules/**",
      ".next/**",
      "out/**",
      "flutter_apps/**/build/**",
      "flutter_apps/**/android/**",
      "flutter_apps/**/ios/**",
      ".dev.vars",
      ".dev.vars.*",
    ],
  },
  {
    rules: {
      // React Compiler-era rules are too strict for the current codebase.
      // Disabled until the UI adopts React Compiler patterns.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
]);