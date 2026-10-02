import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-smoke-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "Start demo" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).hover();
  await page.waitForTimeout(600);
  await page.locator("footer").hover();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(700, 850),
  );
  const explain = page.getByRole("button", { name: "Explain Hold to ask" });
  const code = page.getByRole("button", { name: "Code Hover for example" });
  await explain.hover();
  await page.waitForTimeout(100);
  await page.locator("footer").hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".status").innerText(), "Ready");
  await explain.hover();
  await page.waitForTimeout(400);
  assert.match(await page.locator(".status").innerText(), /Listening/);
  await page.locator("footer").hover();
  await page.waitForTimeout(1900);
  assert.equal(await page.locator("h1").textContent(), "JavaScript arrays");
  const bullet = page
    .locator(".answer-panel:not(.details-layer) .bullet-label")
    .first();
  await bullet.hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".details-layer").count(), 0);
  await page.locator("footer").hover();
  await page.waitForTimeout(350);
  await bullet.hover();
  await page.waitForTimeout(650);
  assert.equal(await page.locator(".details-layer").count(), 1);
  await page.waitForTimeout(550);
  const parent = page.locator('.details-layer li[data-path="0"]');
  assert.equal(await parent.locator(":scope > ul > li").count(), 3);
  assert.equal(
    await parent
      .locator(":scope > ul")
      .evaluate((el) => getComputedStyle(el).listStyleType),
    "disc",
  );
  assert.equal(await page.locator(".details-layer p").count(), 0);
  const child = page.locator('.details-layer li[data-path="0.0"] > button');
  await child.hover();
  await page.waitForTimeout(1200);
  assert.equal(
    await page.locator('.details-layer li[data-path="0.0"] > ul > li').count(),
    3,
  );
  assert.equal(
    await parent.locator(":scope > button").getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(
    await page
      .locator('.details-layer li[data-path="0.0.0"]')
      .evaluate((el) => el.getBoundingClientRect().left),
    (await child.evaluate((el) => el.getBoundingClientRect().left)) + 22,
  );
  await page.screenshot({ path: "/tmp/hover-nested-concepts.png" });
  assert.equal(await page.locator(".status").innerText(), "Ready");
  await page.locator("footer").hover();
  await page.waitForTimeout(350);
  assert.equal(await page.locator(".details-layer").count(), 1);
  await page.getByRole("button", { name: "Hover to return" }).click();
  await page.getByRole("button", { name: "Hover to return" }).click();
  assert.equal(await page.locator(".details-layer").count(), 0);
  await bullet.hover();
  await page.waitForTimeout(650);
  assert.equal(await parent.locator(":scope > ul > li").count(), 3);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(420, 440),
  );
  await page.getByRole("button", { name: "Hover to return" }).click();
  await page.locator("footer").hover();
  await page.waitForTimeout(1900);
  await page
    .locator(".answer-panel:not(.details-layer) .bullet-label")
    .first()
    .hover();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(".details-layer").count(), 1);
  assert.equal(
    await page.locator(".details-layer").evaluate((el) => {
      const source = el.querySelector(".tree-content"),
        area = el.querySelector(".tree-viewport");
      return (
        getComputedStyle(source).visibility === "hidden" ||
        (source.getBoundingClientRect().height <= area.clientHeight + 1 &&
          source.scrollWidth <= area.clientWidth + 1)
      );
    }),
    true,
  );
  assert.equal(
    await page.getByRole("button", { name: /Next|Previous/ }).count(),
    0,
  );
  assert.equal(
    await page.locator('.details-layer li[data-path="0"] > ul > li').count(),
    3,
  );
  await page.screenshot({ path: "/tmp/hover-details.png" });
  await page.getByRole("button", { name: "Hover to return" }).hover();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".details-layer").count(), 0);
  await page.locator("footer").hover();
  const selectedLabel = await page.locator(".code-target").innerText();
  assert.match(selectedLabel, /Code for:/);
  await code.hover();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".code-panel").count(), 0);
  await page.waitForTimeout(900);
  assert.equal(await page.locator(".code-panel").count(), 1);
  assert.equal(await page.locator(".status").innerText(), "Ready");
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".code-panel").count(), 0);
  await page.locator("footer").hover();
  await page.waitForTimeout(400);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(420, 440),
  );
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
    true,
  );
  const layout = await page.locator(".answer-panel").evaluate((el) => ({
    overflow:
      el.scrollHeight > el.clientHeight + 1 ||
      el.scrollWidth > el.clientWidth + 1,
    hidden: getComputedStyle(el).visibility === "hidden",
  }));
  assert.ok(!layout.overflow || layout.hidden);
  await page.getByRole("button", { name: "New topic Hover 1 sec" }).hover();
  await page.waitForTimeout(1900);
  assert.equal(
    await page.locator("h1").textContent(),
    "A little space to think.",
  );
  await page.screenshot({ path: "/tmp/hover-demo.png" });
  const secure = await page.evaluate(() => ({
    node: typeof window.require,
    bridge: !!window.assistant,
  }));
  assert.deepEqual(secure, { node: "undefined", bridge: true });
  console.log(
    "Desktop smoke passed: flyovers, listening, submission, mode follow-up, reset, minimum layout, isolated bridge, nested parent and child lists, markers, ancestor retention, caching, collapse and compact layout.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
