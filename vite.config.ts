import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const swDevBypass: Plugin = {
  name: "sw-dev-bypass",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/sw.js") {
        res.setHeader("Content-Type", "application/javascript");
        res.end("");
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [
    swDevBypass,
    tailwindcss(),
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
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
