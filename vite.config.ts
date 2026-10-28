import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "pnpm-lock.yaml",
      "CHANGELOG.md",
      ".cursor/skills/**",
    ],
  },
  lint: {
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      ".cursor/skills/**",
      ".agents/skills/verify-hacksh/templates/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  pack: {
    entry: ["src/index.ts", "src/printer-api.ts"],
    format: ["esm"],
    platform: "node",
    dts: true,
    sourcemap: true,
    fixedExtension: false,
  },
  run: {
    cache: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
