import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

export default defineConfig({
  base: "./",
  define: {
    __CODE_REVISION__: JSON.stringify(process.env.CODE_REVISION ?? "local"),
    __DATA_REVISION__: JSON.stringify(process.env.DATA_REVISION ?? "local"),
  },
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    cssCodeSplit: false,
    modulePreload: false,
    target: "es2022",
  },
})
