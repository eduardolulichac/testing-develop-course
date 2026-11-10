import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import rootConfig from "../../eslint.config.mjs";

// ESLint looks up the nearest config per file, so the root `pnpm lint` also uses this one
// for files under apps/platform.
const config = [
  ...rootConfig,
  ...nextVitals,
  ...nextTs,
  {
    settings: { next: { rootDir: import.meta.dirname } },
  },
  {
    // Playwright fixtures receive a `use` callback that is not a React hook.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    ignores: [".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**"],
  },
];

export default config;
