import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-code-test-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  // Exercise the real renderer recording path against synthetic audio. Main stays
  // in demo mode: no physical microphone permission and no provider requests.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    ipcMain.removeHandler("config");
    ipcMain.handle("config", () => ({ demo: false }));
    ipcMain.removeHandler("microphone");
    ipcMain.handle("microphone", () => true);
    BrowserWindow.getAllWindows()[0].setSize(700, 760);
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
      const stream = output.stream;
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          oscillator.stop();
          void context.close();
        };
      }
      return stream;
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Enable microphone" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).hover();
  await page.waitForTimeout(600);
  await page.locator("footer").hover();
  const code = page.getByRole("button", { name: "Code Hover for example" });
  assert.equal(await code.getAttribute("aria-disabled"), "true");
  const setupCalls = await page.evaluate(() => window.micCalls);
  await page.getByRole("button", { name: "Explain Hold to ask" }).hover();
  await page.waitForTimeout(1300);
  assert.match(await page.locator(".status").innerText(), /Listening/);
  assert.equal(await page.evaluate(() => window.micCalls), setupCalls + 1);
  await page.locator("footer").hover();
  await page.waitForTimeout(1700);
  await page
    .locator('.answer-panel:not(.details-layer) [data-path="0"] > button')
    .hover();
  await page.waitForTimeout(1200);
  await page.locator('.details-layer [data-path="0.0"] > button').hover();
  await page.waitForTimeout(1200);
  await page.locator('.details-layer [data-path="0.0.0"] > button').hover();
  await page.waitForTimeout(1200);
  const treeBefore = await page.locator(".details-layer").innerHTML();
  // Brief crossings and leaving the list must neither collapse nor select.
  await page.locator('.details-layer [data-path="0.0.0.0"] > button').hover();
  await page.waitForTimeout(100);
  await page.locator("footer").hover();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".details-layer").innerHTML(), treeBefore);
  await page.screenshot({ path: "/tmp/code-selection-check.png" });
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Insertion sequence",
  );
  const beforeCode = await page.evaluate(() => window.micCalls);
  await code.hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".code-panel").count(), 0);
  await page.waitForTimeout(900);
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Insertion sequence",
  );
  assert.match(
    await page.locator(".code-panel code").innerText(),
    /const items/,
  );
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  await page.waitForTimeout(1000);
  assert.equal(await page.locator(".status").innerText(), "Ready");
  await page.screenshot({ path: "/tmp/selected-code.png" });
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".code-panel").count(), 0);
  assert.equal(
    await page
      .locator('.details-layer [data-path="0.0.0"] > button')
      .getAttribute("aria-current"),
    "true",
  );
  assert.equal(
    await page
      .locator('.details-layer [data-path="0.0.0"] > button')
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(await page.locator(".details-layer").innerHTML(), treeBefore);
  await page.screenshot({ path: "/tmp/restored-explanation.png" });
  await code.hover();
  await page.waitForTimeout(650);
  assert.equal(
    await page.locator(".code-target").innerText(),
    "Code for: Insertion sequence",
  );
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Hover to return" }).click();
  await page.locator('.details-layer [data-path="0.0"] > button').hover();
  await page.waitForTimeout(700);
  const templateCode =
    "const template = `\n<ul>\n" +
    Array.from(
      { length: 28 },
      (_, i) => "  <li>Template item " + i + "</li>",
    ).join("\n") +
    "\n</ul>\n`;\ndocument.body.textContent = template;";
  await app.evaluate(({ ipcMain, BrowserWindow }, source) => {
    ipcMain.removeHandler("code");
    ipcMain.handle("code", (_event, version, path) => {
      globalThis.syntheticCodeRequest = { version, path };
      return {
        answer: {
          title: "Stable item order",
          code: source,
          language: "JavaScript",
          incomplete: false,
          fragments: [],
        },
      };
    });
    BrowserWindow.getAllWindows()[0].setSize(420, 440);
  }, templateCode);
  await code.hover();
  await page.waitForTimeout(1600);
  assert.deepEqual(
    (await app.evaluate(() => globalThis.syntheticCodeRequest)).path,
    [0, 0],
  );
  assert.equal(
    await page.locator(".display-source code").textContent(),
    templateCode,
  );
  assert.equal(await page.locator(".code-page-navigation").count(), 0);
  assert.equal(await page.locator(".code-panel code li").count(), 0);
  assert.equal(
    await page
      .locator(".solution-viewport")
      .evaluate(
        (el) =>
          el.scrollHeight > el.clientHeight &&
          getComputedStyle(el).overflowY === "scroll",
      ),
    true,
  );
  assert.equal(await page.evaluate(() => window.micCalls), beforeCode);
  await page.getByRole("button", { name: "New topic Hover 1 sec" }).hover();
  await page.waitForTimeout(1100);
  assert.equal(await code.getAttribute("aria-disabled"), "true");
  assert.equal(await page.locator(".code-panel").count(), 0);
  console.log(
    "Code flow passed: synthetic Explain recording, selected nested item, zero Code microphone calls, cached return/reopen, preserved tree, reset.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
