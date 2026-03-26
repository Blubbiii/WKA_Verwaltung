import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
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
  {
    // PDF templates use @react-pdf/renderer's <Image> component, not HTML <img>
    // Accessibility rules don't apply to PDF rendering
    files: ["src/lib/pdf/**/*.tsx"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
];

export default eslintConfig;
