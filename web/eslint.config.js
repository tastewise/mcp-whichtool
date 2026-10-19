import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default defineConfig([
  { ignores: ["dist", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    files: ["src/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["react-dom", "react-dom/*"], message: "src/api must not touch the DOM" },
          { group: ["**/components/**", "@/components/**"], message: "src/api must not import UI" },
          { group: ["**/features/**", "@/features/**"], message: "src/api must not import features" },
          { group: ["**/pages/**", "@/pages/**"], message: "src/api must not import pages" },
        ],
      }],
    },
  },
]);
