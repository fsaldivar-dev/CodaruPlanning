import { defineConfig } from "vite";
export default defineConfig({
  server: {
    port: 1435,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/.qa/**"] },
  },
  clearScreen: false,
  build: { target: "safari16", chunkSizeWarningLimit: 350 },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
});
