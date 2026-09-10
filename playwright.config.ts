import { defineConfig, devices } from "@playwright/test";

const useExistingDist = process.env.E2E_USE_EXISTING_DIST === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["dot"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4321",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: useExistingDist
      ? "bun run preview --host 127.0.0.1"
      : "bun run build && bun run preview --host 127.0.0.1",
    url: "http://127.0.0.1:4321/videos/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
