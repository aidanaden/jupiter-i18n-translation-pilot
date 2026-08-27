import { execFileSync } from "node:child_process";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const readGit = (args: string[], fallback: string) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
};

const deployedCommit =
  process.env.GITHUB_SHA ??
  process.env.CLOUDFLARE_COMMIT_SHA ??
  readGit(["rev-parse", "HEAD"], "local-development");
const catalogTimestamp = readGit(
  ["log", "-1", "--format=%cI", "--", "src/i18n/locales/zh-Hans/messages.po"],
  new Date().toISOString(),
);

export default defineConfig({
  define: {
    __CATALOG_TIMESTAMP__: JSON.stringify(catalogTimestamp),
    __DEPLOYED_COMMIT__: JSON.stringify(deployedCommit.slice(0, 12)),
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      prerender: {
        enabled: false,
      },
      spa: {
        enabled: false,
      },
      sitemap: {
        enabled: false,
      },
      server: {
        entry: "./server",
      },
    }),
    tailwindcss(),
    react(),
  ],
});
