import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  {
    extends: [...next],
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
