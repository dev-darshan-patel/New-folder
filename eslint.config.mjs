import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Palette classes that have been migrated to design tokens. Listing them
// explicitly — rather than banning every `slate-*`/`indigo-*` — makes this a
// ratchet: it locks in what's already converted without blocking the shades
// still awaiting a human-reviewed pass (slate-400/600/700/800, bg-slate-50,
// indigo-50/100/700), which carry visual hierarchy a codemod can't judge.
const MIGRATED_PALETTE_CLASSES = {
  "text-slate-900": "text-foreground",
  "text-slate-500": "text-muted-foreground",
  "border-slate-200": "border-border",
  "border-slate-300": "border-input",
  "bg-slate-100": "bg-muted",
  "text-indigo-600": "text-primary",
  "border-indigo-500": "border-ring",
  // Brand purple, fully unified — literal indigo renders #4f39f6 under
  // Tailwind 4 while --primary is #4f46e5, so any of these reintroduces a
  // second, slightly-off brand colour. text-indigo-400 is intentionally
  // absent: the admin sidebar accent still needs it on its dark surface.
  "bg-indigo-600": "bg-primary",
  "bg-indigo-500": "bg-primary",
  "border-indigo-600": "border-primary",
  "ring-indigo-600": "ring-primary",
  "text-indigo-800": "text-primary",
  "text-indigo-700": "text-primary",
  "text-indigo-500": "text-primary",
  "bg-indigo-100": "bg-primary/10",
  "bg-indigo-50": "bg-primary/5",
  "border-indigo-300": "border-primary/30",
  "border-indigo-200": "border-primary/20",
};

// (?<![\w-]) / (?![\w-]) match a whole class token while still allowing
// variant prefixes like hover: sm: group-hover:.
const bannedPattern = `(?<![\\w-])(${Object.keys(MIGRATED_PALETTE_CLASSES).join("|")})(?![\\w-])`;
const bannedMessage =
  "Use the design token instead of a raw palette class: " +
  Object.entries(MIGRATED_PALETTE_CLASSES)
    .map(([from, to]) => `${from} -> ${to}`)
    .join(", ") +
  ". See src/app/globals.css.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local tool/session artifacts, not application code.
    ".remember/**",
    "graphify-out/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=/${bannedPattern}/]`, message: bannedMessage },
        { selector: `TemplateElement[value.raw=/${bannedPattern}/]`, message: bannedMessage },
      ],
    },
  },
]);

export default eslintConfig;
