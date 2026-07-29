import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  define: {
    __CODE_REVISION__: JSON.stringify("test"),
    __DATA_REVISION__: JSON.stringify("test"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/data/**/*.ts"],
    },
  },
})
