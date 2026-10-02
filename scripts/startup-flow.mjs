import "./check-node.mjs";
import { _electron as electron, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-startup-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const neutral = () => page.locator("footer").hover();
  const hover = async (name, ms = 650) => {
    await neutral();
    await button(name).hover();
    await page.waitForTimeout(ms);
    await neutral();
  };
  const explain = button("Explain Hold to ask");
  const capture = page.locator(".target.capture");
  await page.getByRole("region", { name: "Session context" }).waitFor();
  await expect(page.locator(".status")).toHaveText("Ready");
  await expect(capture).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator(".target.purple")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const pointers = await page
    .locator(".controls .target, .target.capture")
    .evaluateAll((nodes) =>
      nodes.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          cursor: getComputedStyle(el).cursor,
          hit: el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          ),
        };
      }),
    );
  assert.ok(
    pointers.every((p) => p.hit && !["wait", "progress"].includes(p.cursor)),
  );
  // Start without applying or skipping context, and exercise the actual hover gate.
  await button("Start demo").click();
  await explain.hover();
  await expect(page.locator(".status")).toContainText("Listening");
  await expect(page.locator(".session-editor")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".status")).toHaveText("Ready");
  await page.waitForTimeout(500);
  await expect(page.locator(".status")).toHaveText("Ready");
  await neutral();
  await explain.hover();
  await expect(page.locator(".status")).toContainText("Listening");
  await neutral();
  await expect(page.locator(".bullet-label").first()).toBeVisible();
  // Fresh renderer: Capture works directly from setup and opens the real selector.
  await page.reload();
  await expect(capture).toHaveAttribute("aria-disabled", "false");
  const nextWindow = app.waitForEvent("window");
  await capture.hover();
  const selector = await nextWindow;
  await selector.waitForSelector("#screen");
  await selector.close();
  await expect(page.locator(".message")).toContainText("Capture cancelled");
  await neutral();
  await expect(capture).toHaveAttribute("aria-disabled", "false");
  // Rejected and unanswered initialization are injected at the IPC boundary.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("config");
    ipcMain.handle("config", () => {
      throw new Error("test initialization failure");
    });
    ipcMain.removeHandler("screenshot:capture");
    globalThis.captureAttempts = 0;
    ipcMain.handle("screenshot:capture", () => {
      if (++globalThis.captureAttempts === 1)
        throw new Error("test capture failure");
      return { cancelled: true };
    });
  });
  await page.reload();
  await expect(button("Retry connection")).toBeEnabled();
  await expect(page.locator(".status")).toHaveText("Ready");
  await capture.hover();
  await expect(page.locator(".status")).toHaveText("Error");
  await neutral();
  await expect(capture).toHaveAttribute("aria-disabled", "false");
  await capture.hover();
  await expect(page.locator(".status")).toHaveText("Ready");
  assert.equal(await app.evaluate(() => globalThis.captureAttempts), 2);
  await neutral();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("config");
    ipcMain.handle(
      "config",
      () =>
        new Promise((resolve) => {
          globalThis.finishConfig = resolve;
        }),
    );
  });
  await button("Retry connection").click();
  await expect(button("Retry connection")).toBeEnabled({ timeout: 8000 });
  await expect(capture).toHaveAttribute("aria-disabled", "false");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("config");
    ipcMain.handle("config", () => ({ demo: true }));
  });
  await button("Retry connection").click();
  await expect(button("Start demo")).toBeEnabled();
  await app.evaluate(() => globalThis.finishConfig({ demo: false }));
  await expect(button("Start demo")).toBeEnabled();
  await button("Start demo").click();
  // Applying context releases busy state after timeout and after rejection; retry succeeds.
  await hover("Edit context");
  await page.locator("#session-context").fill("React and TypeScript");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("session:set");
    ipcMain.handle(
      "session:set",
      () =>
        new Promise((resolve) => {
          globalThis.finishContext = resolve;
        }),
    );
  });
  await hover("Apply");
  await expect(page.locator(".message")).toContainText("Could not apply", {
    timeout: 8000,
  });
  await expect(button("Apply")).toBeEnabled();
  await expect(explain).toHaveAttribute("aria-disabled", "false");
  await expect(capture).toHaveAttribute("aria-disabled", "false");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("session:set");
    ipcMain.handle("session:set", () => {
      throw new Error("test context failure");
    });
  });
  await hover("Apply");
  await expect(button("Apply")).toBeEnabled();
  await expect(page.locator(".message")).toContainText("Could not apply");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("session:set");
    ipcMain.handle("session:set", () => undefined);
  });
  await hover("Apply");
  await expect(page.locator(".status")).toHaveText("Ready");
  await expect(page.locator(".session-summary")).toContainText(
    "React and TypeScript",
  );
  await app.evaluate(() => globalThis.finishContext());
  await expect(page.locator(".session-editor")).toHaveCount(0);
  await explain.hover();
  await expect(page.locator(".status")).toContainText("Listening");
  await neutral();
  await expect(page.locator(".bullet-label").first()).toBeVisible();
  console.log(
    "Startup UI passed: fresh Ready, optional setup, no wait cursor or intercepting overlay, real hover/record cancellation and re-entry, real capture selector cancellation, injected config rejection/timeout/retry/late reply, capture failure/retry, context rejection/timeout/retry. No paid API calls.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
