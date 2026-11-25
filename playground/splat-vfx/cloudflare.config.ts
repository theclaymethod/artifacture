import { defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "gaussian-splat-deck",
    compatibilityDate: "2026-11-24",
    workersDev: false,
    previewUrls: false,
    assets: {
      htmlHandling: "force-trailing-slash",
      notFoundHandling: "none",
    },
    triggers: [
      triggers.fetch({
        pattern: "playground.claytonkim.com/splat-deck",
        zone: "claytonkim.com",
      }),
      triggers.fetch({
        pattern: "playground.claytonkim.com/splat-deck/*",
        zone: "claytonkim.com",
      }),
    ],
    observability: {
      enabled: true,
    },
  },
});
