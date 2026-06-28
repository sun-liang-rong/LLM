import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/admin": "http://localhost:3000",
      "/auth": "http://localhost:3000",
      "/console": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/public": "http://localhost:3000",
      "/v1": "http://localhost:3000",
    },
  },
});
