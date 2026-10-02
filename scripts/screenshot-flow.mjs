import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-flows-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(700, 850);
    ipcMain.removeHandler("config");
    ipcMain.handle("config", () => ({ demo: false }));
    ipcMain.removeHandler("microphone");
    ipcMain.handle("microphone", () => true);
    globalThis.autoShots = [];
    globalThis.followupShots = [];
    const implementation = {
      intent: "implement",
      title: "",
      code: "function add(a, b) { return a + b; }",
      language: "",
      incomplete: false,
      outputs: [],
      fragments: [],
      approach: "",
      complexity: "",
    };
    const output = {
      ...implementation,
      intent: "output",
      code: "",
      outputs: [{ label: "A", kind: "value", value: "3", reason: "" }],
    };
    ipcMain.removeHandler("screenshot:analyze");
    ipcMain.handle("screenshot:analyze", async (_event, shotId) => {
      globalThis.autoShots.push(shotId);
      if (globalThis.autoShots.length === 3)
        await new Promise((resolve) => {
          globalThis.finishOld = resolve;
        });
      return {
        id: shotId,
        answer: globalThis.autoShots.length === 1 ? implementation : output,
      };
    });
    ipcMain.removeHandler("screenshot:ask");
    ipcMain.handle("screenshot:ask", (_event, shotId, request) => {
      globalThis.followupShots.push({
        shotId,
        audioBytes: request.audio?.length ?? 0,
      });
      return {
        id: request.id,
        answer: {
          ...output,
          outputs: [
            { label: "Follow-up", kind: "value", value: "4", reason: "" },
          ],
        },
      };
    });
  });
  await page.addInitScript(() => {
    window.micCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.micCalls++;
      const context = new AudioContext();
      await context.resume();
      const oscillator = context.createOscillator();
      const output = context.createMediaStreamDestination();
      oscillator.connect(output);
      oscillator.start();
      for (const track of output.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
      }
      return output.stream;
    };
  });
  await page.reload();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].focus());
  await page.getByRole("button", { name: "Skip", exact: true }).hover();
  await page.locator(".session-editor").waitFor({ state: "hidden" });
  await page.locator("footer").hover();
  const neutral = async () => {
    await page.locator("footer").hover();
  };
  const capture = async () => {
    await neutral();
    const next = app.waitForEvent("window");
    await page.locator(".target.capture").hover();
    const selector = await next;
    await selector.waitForSelector("#screen");
    await selector.waitForTimeout(300);
    await selector.mouse.move(60, 120);
    await selector.mouse.down();
    await selector.mouse.move(620, 310, { steps: 10 });
    await selector.mouse.up();
    await page.waitForSelector(".screenshot-attached img");
    await neutral();
  };
  await capture();
  await page.waitForSelector(".solution-text code");
  assert.equal(
    await page.locator(".solution-text code").innerText(),
    "function add(a, b) { return a + b; }",
  );
  assert.equal(await page.evaluate(() => window.micCalls), 0);
  assert.equal(await app.evaluate(() => globalThis.autoShots.length), 1);
  await page.waitForTimeout(1000);
  assert.equal(await app.evaluate(() => globalThis.autoShots.length), 1);
  // Enable only for explicit spoken follow-up and concept-question tests.
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await neutral();
  await page.waitForFunction(() => document.querySelector(".screenshot-ask")?.getAttribute("aria-disabled") === "false");
  await page.locator(".screenshot-ask").hover();
  await page.waitForTimeout(900);
  await neutral();
  await page.getByText("Follow-up: 4", { exact: true }).waitFor();
  const followups = await app.evaluate(() => ({
    initial: globalThis.autoShots[0],
    asks: globalThis.followupShots,
  }));
  assert.equal(followups.asks[0].shotId, followups.initial);
  assert.ok(followups.asks[0].audioBytes > 0);
  // First Explain hover returns without recording; fresh entry asks a concept question.
  const beforeReturn = await page.evaluate(() => window.micCalls);
  await page.locator(".target.blue").hover();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.micCalls), beforeReturn);
  await neutral();
  await page.locator(".target.blue").hover();
  await page.waitForTimeout(900);
  await neutral();
  await page.getByRole("heading", { name: "JavaScript arrays" }).waitFor();
  const beforeCode = await page.evaluate(() => window.micCalls);
  const code = page.locator(".target.purple");
  assert.equal(await code.getAttribute("aria-disabled"), "false");
  await code.hover();
  await page.waitForSelector(".code-panel code");
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: JavaScript arrays",
  );
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  await page
    .locator('.answer-panel:not(.details-layer) [data-path="0"] > button')
    .hover();
  await page.waitForTimeout(1200);
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Ordered collections",
  );
  await code.hover();
  await page.waitForSelector(".code-panel code");
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Ordered collections",
  );
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  await page.locator('.details-layer [data-path="0.0"] > button').hover();
  await page.waitForTimeout(1200);
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Stable item order",
  );
  await code.hover();
  await page.waitForSelector(".code-panel code");
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Stable item order",
  );
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  // Screenshot replacement must not replace the concept selection.
  await capture();
  await page.getByText("A: 3", { exact: true }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.autoShots.length), 2);
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Stable item order",
  );
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  await neutral();
  await code.hover();
  await page.waitForSelector(".code-panel code");
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Stable item order",
  );
  await neutral();
  await page
    .getByRole("button", {
      name: "View screenshot answer Return without recording",
    })
    .hover();
  await page.getByText("A: 3", { exact: true }).waitFor();
  assert.equal(await app.evaluate(() => globalThis.autoShots.length), 2);
  // Concept Code remains usable while screenshot analysis is unresolved.
  await capture();
  await code.hover();
  await page.waitForSelector(".code-panel code");
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Stable item order",
  );
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  // Reset must reject the eventual screenshot result even from another view.
  await page.getByRole("button", { name: "New topic Hover 1 sec" }).hover();
  await page.waitForTimeout(1200);
  await app.evaluate(() => globalThis.finishOld());
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".screenshot-attached").count(), 0);
  assert.equal(await page.locator(".code-panel").count(), 0);
  assert.equal(await code.getAttribute("aria-disabled"), "true");
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  console.log(
    "Both flows passed: automatic implementation/output fixtures, one analysis per capture, explicit audio follow-up targets attachment, root/main/nested concept Code, persistent child selection, separate screenshot/concept views, zero capture/Code microphone calls, stale reset response ignored.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
