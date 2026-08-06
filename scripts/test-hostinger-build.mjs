#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = String(process.argv[2] || "http://127.0.0.1:4173").replace(/\/$/, "");
const routes = [
  "/",
  "/auth/",
  "/dashboard/",
  "/funil/",
  "/whatsapp/",
  "/meta-ads/",
  "/bot/",
];
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const route of routes) {
    const page = await browser.newPage();
    const consoleErrors = [];
    const failedResponses = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    await page.waitForTimeout(500);

    results.push({
      route,
      status: response?.status() ?? null,
      finalUrl: page.url(),
      title: await page.title(),
      heading: await page.locator("h1").first().textContent().catch(() => null),
      failedResponses,
      consoleErrors,
    });

    await page.close();
  }
} finally {
  await browser.close();
}

const failed = results.some(
  (result) =>
    result.status !== 200 ||
    result.failedResponses.length > 0 ||
    result.consoleErrors.length > 0,
);

console.log(JSON.stringify({ baseUrl, failed, results }, null, 2));
process.exitCode = failed ? 1 : 0;
