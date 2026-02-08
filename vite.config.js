import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react()],
  base: "/NAPE-A-Warhammer-40K-Attack-Calculator/",
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
