import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from "vite-plugin-pwa";
import { localApiProxyPlugin } from "./vite.local-api-proxy";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    localApiProxyPlugin(mode),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      devOptions: {
        enabled: false, // Disabled in dev to prevent false update prompts - only active in production
      },
      manifest: {
        name: "Maneuver - A FRC Strategy Suite",
        short_name: "Maneuver FRC",
        description: "Maneuver is a FRC Strategy Suite designed for offline first robotics competition scouting.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png'],
      workbox: {
        // Avoid workbox terser crashes in some environments; esbuild is enough for SW minify
        mode: 'development',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB (increase from default 2 MB)
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "script",
            handler: "NetworkFirst",
            options: {
              cacheName: "js-cache",
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "style",
            handler: "NetworkFirst",
            options: {
              cacheName: "css-cache",
            },
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "NetworkFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60, // Cache images for 30 days
              },
            },
          },
        ],
      },
      injectRegister: false,
    }),
  ],
  server: {
    host: true, // same as "--host" flag
    allowedHosts: [
      '.ngrok-free.dev',
      '.ngrok-free.app',
      '.ngrok.io',
    ],
  },
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "./src/core"),
      "@/game": path.resolve(__dirname, "./src/game-template"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
