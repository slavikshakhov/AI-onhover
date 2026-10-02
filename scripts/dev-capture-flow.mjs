import "./check-node.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

// Attach to npm run dev; never replace desktopCapturer or the capture IPC handlers.
const browser = await chromium.connectOverCDP(
  `http://127.0.0.1:${process.env.HOVER_DEV_DEBUG_PORT || 9333}`,
);
let page;
try {
  const context = browser.contexts()[0];
  page = context
    .pages()
    .find((p) => p.url().startsWith("http://127.0.0.1:5173"));
  assert.ok(page, "The actual Vite-backed app window must exist");
  await page.waitForSelector(".target.capture");
  assert.equal(
    (await page.evaluate(() => window.assistant.config())).demo,
    false,
  );
  await page.evaluate(() => {
    window.captureOriginalGetUserMedia = navigator.mediaDevices.getUserMedia;
    window.captureOriginalMediaRecorder = window.MediaRecorder;
    window.captureMicCalls = 0;
    window.captureRecorderCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.captureMicCalls++;
      throw new Error("Microphone must not be requested during capture");
    };
    const NativeRecorder = window.MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(...args) {
        super(...args);
        window.captureRecorderCalls++;
      }
    };
  });
  await page.bringToFront();
  await page.locator("footer").hover();
  const overlayPromise = context.waitForEvent("page", { timeout: 35000 });
  await page.locator(".target.capture").hover();
  const selector = await overlayPromise;
  await selector.waitForSelector("#screen");
  // Verify the real capture frame exists without persisting or printing its contents.
  const frame = await selector.evaluate(async () => {
    const frame = await window.region.frame();
    const image = new Image();
    image.src = frame.image;
    await image.decode();
    return {
      demo: frame.demo,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  });
  assert.equal(frame.demo, false);
  assert.ok(frame.width > 100 && frame.height > 100);
  await selector.waitForTimeout(300);
  await selector.mouse.move(60, 120);
  await selector.mouse.down();
  await selector.mouse.move(620, 310, { steps: 10 });
  await selector.mouse.up();
  const attached = page.locator(".screenshot-attached img");
  await attached.waitFor({ timeout: 10000 });
  assert.ok(
    await attached.evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await page.waitForFunction(
    () => document.querySelector(".status")?.textContent !== "Processing",
    undefined,
    { timeout: 60000 },
  );
  assert.equal(await page.evaluate(() => window.captureMicCalls), 0);
  assert.equal(await page.evaluate(() => window.captureRecorderCalls), 0);
  assert.equal(await page.locator(".status").innerText(), "Ready");
  console.log(
    "REAL dev capture passed: Capture hover → desktop frame → rectangle selection → decoded attachment; zero getUserMedia/MediaRecorder calls. No image saved; automatic analysis sends the captured region to the configured provider.",
  );
} finally {
  await page
    ?.evaluate(() => {
      if (window.captureOriginalGetUserMedia)
        navigator.mediaDevices.getUserMedia =
          window.captureOriginalGetUserMedia;
      if (window.captureOriginalMediaRecorder)
        window.MediaRecorder = window.captureOriginalMediaRecorder;
      delete window.captureOriginalGetUserMedia;
      delete window.captureOriginalMediaRecorder;
    })
    .catch(() => {});
  await browser.close();
}
