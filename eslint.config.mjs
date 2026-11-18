import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["vendor/**",".next/**", "out/**", "coverage/**", "next-env.d.ts", "src/generated/**", "playwright-report/**", "test-results/**", "test-results-vercel/**", ".vercel/**", ".runtime-evidence/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
]);
