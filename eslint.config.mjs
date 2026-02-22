import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Downgrade to warning - too many existing any types to fix immediately
      "@typescript-eslint/no-explicit-any": "warn",
      // Unused vars are warnings, not errors
      "@typescript-eslint/no-unused-vars": "warn",
      // Allow img elements (Next Image is optional)
      "@next/next/no-img-element": "warn",
      // React hooks deps are warnings
      "react-hooks/exhaustive-deps": "warn",
      // prefer-const is a warning
      "prefer-const": "warn",
    },
  },
];

export default eslintConfig;
