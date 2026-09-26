import { defineConfig } from "tsup";

export default defineConfig({
  // Library entries (importable) + the CLI dispatcher (executable). The individual
  // src/bin/*.ts scripts are NOT built — the `repo-gates` dispatcher supersedes them.
  entry: {
    index: "src/index.ts",
    config: "src/config.ts",
    "design-system": "src/design-system.ts",
    "eslint-boundaries": "src/eslint-boundaries.ts",
    "bin/repo-gates": "src/bin/repo-gates.ts",
  },
  format: "esm",
  target: "node18",
  // tsup injects `baseUrl` into its dts compile, which TypeScript 6 deprecates.
  // TypeScript 7 drops the JS API tsup's dts build relies on, so stay on 6.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  clean: true,
  sourcemap: false,
  splitting: false,
  shims: false,
});
