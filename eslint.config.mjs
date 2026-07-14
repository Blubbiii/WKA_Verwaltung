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
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      // Allow img elements (Next Image is optional)
      "@next/next/no-img-element": "warn",
      // React hooks deps are warnings
      "react-hooks/exhaustive-deps": "warn",
      // prefer-const is a warning
      "prefer-const": "warn",

      // ── React Compiler rules (eslint-plugin-react-hooks v7.1+) ──────────
      // These rules ship enabled-by-default with eslint-config-next 16.2.6+
      // and target codebases adopting the React Compiler. WPM runs React 19
      // WITHOUT the React Compiler, so they produce false-positive noise on
      // established patterns (e.g. the documented fetchData()→setState() in
      // useEffect data-loading pattern flags `set-state-in-effect` 180+ times).
      // Disabled until/unless React Compiler is adopted; re-enable then.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      "react-hooks/set-state-in-render": "off",

      // ── a11y ──────────────────────────────────────────────────────────────
      // UX18: Label-For-Association als warn — verhindert dass neue
      // Formulare Labels ohne htmlFor/nested-Input schreiben. Warn (nicht
      // error), um CI nicht zu blockieren.
      "jsx-a11y/label-has-associated-control": "warn",
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
  {
    // API-Routes: enforce apiError() instead of NextResponse.json({error:...}).
    // WARN (not error) — Migration kann graduell laufen, blockiert keinen Build.
    // Siehe docs/api-conventions.md fuer das Envelope-Pattern.
    files: ["src/app/api/**/route.ts"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            'CallExpression[callee.object.name="NextResponse"][callee.property.name="json"] > ObjectExpression > Property[key.name="error"]',
          message:
            "Use apiError() from @/lib/api-errors instead of NextResponse.json({error:...}) for consistent error responses. See docs/api-conventions.md.",
        },
      ],
    },
  },
];

export default eslintConfig;
