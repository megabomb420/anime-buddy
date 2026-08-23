import fs from "fs"
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { inspectAttr } from 'kimi-plugin-inspect-react'

function spaGithubPagesFallback() {
  return {
    name: "spa-github-pages-fallback",
    closeBundle() {
      const index = path.resolve(__dirname, "dist/index.html")
      if (!fs.existsSync(index)) return
      fs.copyFileSync(index, path.resolve(__dirname, "dist/404.html"))
      fs.writeFileSync(path.resolve(__dirname, "dist/.nojekyll"), "")
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/anime-buddy/" : "./",
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [],
      manifest: {
        name: "Anime Buddy",
        short_name: "Anime Buddy",
        description: "Your intelligent anime friend — discover Crunchyroll anime that fit your taste.",
        theme_color: "#0b0b10",
        background_color: "#0b0b10",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        icons: [
          // TODO: add real artwork icons in public/ before release.
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        // Never cache API responses blindly — catalog/AI calls must stay live.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
    spaGithubPagesFallback(),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
