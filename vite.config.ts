import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "Quixo",
        short_name: "Quixo",
        description: "Quixo als installierbare Offline-PWA.",
        theme_color: "#12100d",
        background_color: "#f7f1e6",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,ico,png,webmanifest}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "quixo-pages",
              networkTimeoutSeconds: 3
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
