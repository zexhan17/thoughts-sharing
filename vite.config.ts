import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["game.png", "favicon.ico"],
      manifest: {
        name: "Thoughts",
        short_name: "Thoughts",
        description: "Personal thought diary",
        theme_color: "#7c3aed",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "game.png", sizes: "192x192", type: "image/png" },
          { src: "game.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
