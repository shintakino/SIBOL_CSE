import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
    "bootstrap-admin": "../../scripts/bootstrap-admin.ts",
    "reconcile-deletions": "../../scripts/reconcile-deletions.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
    onlyBundle: false,
  },
});
