/** Shared policy for consumer ESLint and Oxlint configs. No linter runtime dependency. */
export const designSystemRules = {
  "shadcn/no-restyle": ["error", { allow: ["layout"] }],
  "shadcn/no-raw-colors": "error",
  "shadcn/no-arbitrary-values": "error",
  "shadcn/no-inline-styles": "error",
  "shadcn/no-unknown-classes": "error",
  "shadcn/require-static-classes": "error",
} as const;

/** Component implementations may define their own styling. Other checks still apply. */
export const componentDefinitionRules = { "shadcn/no-restyle": "off" } as const;
