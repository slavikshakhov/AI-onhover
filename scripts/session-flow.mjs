import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-session-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const hover = async (name, delay = 650) => {
    await page.locator("footer").hover();
    await page.getByRole("button", { name, exact: true }).hover();
    await page.waitForTimeout(delay);
    await page.locator("footer").hover();
  };
  await page
    .getByRole("region", { name: "Session context" })
    .waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Start demo" }).click();
  await hover("Dictate Hold to record");
  await page.waitForTimeout(300);
  assert.match(await page.locator("#session-context").inputValue(), /Angular/);
  await page
    .locator("#session-context")
    .fill("Front end: Angular / TypeScript; back end: Java / Spring Boot");
  await hover("Apply");
  assert.equal(await page.locator(".session-editor").count(), 0);
  assert.match(await page.locator(".session-summary").innerText(), /Angular/);
  await hover("Explain Hold to ask", 550);
  await page.waitForTimeout(1000);
  await hover("New topic Hover 1 sec", 1100);
  assert.match(await page.locator(".session-summary").innerText(), /Angular/);
  assert.equal(await page.locator(".bullet-label").count(), 0);
  // A pending old-context renderer response must not restore old state after Apply.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("ask");
    ipcMain.handle(
      "ask",
      () =>
        new Promise((resolve) => {
          globalThis.resolveOldAsk = resolve;
        }),
    );
  });
  await hover("Explain Hold to ask", 550);
  await hover("Edit context");
  await page.locator("#session-context").fill("React / TypeScript; Node.js");
  await hover("Apply");
  await app.evaluate(() =>
    globalThis.resolveOldAsk({
      id: "old",
      version: "old",
      answer: {
        title: "STALE ANSWER",
        fragments: ["stale"],
        code: "",
        language: "",
        incomplete: false,
      },
    }),
  );
  await page.waitForTimeout(200);
  assert.equal(
    await page.getByText("STALE ANSWER", { exact: true }).count(),
    0,
  );
  assert.match(await page.locator(".session-summary").innerText(), /React/);
  await hover("Edit context");
  await hover("Clear context");
  assert.match(
    await page.locator(".session-summary").innerText(),
    /Front end: React/,
  );
  await page.reload();
  assert.equal(await page.locator("#session-context").inputValue(), "");
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(420, 600),
  );
  await page.waitForTimeout(300);
  const geometry = await page.locator(".session-editor").evaluate((el) => {
    const panel = el.getBoundingClientRect();
    return [...el.children].every(
      (child) =>
        child.getBoundingClientRect().bottom <= panel.bottom &&
        child.getBoundingClientRect().right <= panel.right,
    );
  });
  assert.equal(geometry, true);
  await page.screenshot({ path: "/tmp/session-setup.png" });
  console.log(
    "Session UI passed: startup setup, demo dictation, Apply, New topic preservation, pending-response invalidation, explicit clearing, and fresh renderer state.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
