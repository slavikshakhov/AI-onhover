import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-scroll-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.getByRole("button", { name: "Start demo" }).click();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page.getByRole("button", { name: "Explain Hold to ask" }).hover();
  await page.waitForTimeout(600);
  await page.locator("footer").hover();
  await page.waitForTimeout(1500);
  const full =
    "function complete() {\n" +
    "  required();\n".repeat(400) +
    "  // " +
    "wide".repeat(200) +
    "\n  return 7;\n}";
  await app.evaluate(({ ipcMain }, code) => {
    ipcMain.removeHandler("code");
    ipcMain.handle("code", () => ({
      answer: {
        title: "Complete",
        fragments: [],
        language: "JS",
        incomplete: false,
        code,
      },
    }));
  }, full);
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
  await page.getByRole("button", { name: "Code Hover for example" }).hover();
  await page.waitForTimeout(900);
  for (const size of [
    [480, 700],
    [420, 600],
    [900, 950],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setSize(...size),
      size,
    );
    await page.locator("footer").hover();
    await page.waitForTimeout(300);
    const before = await bounds();
    assert.equal(
      await page.locator(".display-source code").textContent(),
      full,
    );
    assert.equal(await page.locator(".code-page-navigation").count(), 0);
    const area = page.locator(".solution-viewport");
    assert.deepEqual(
      await area.evaluate((el) => {
        const control = document
          .querySelector(".panel-controls")
          .getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          vertical: el.scrollHeight > el.clientHeight,
          horizontal: el.scrollWidth > el.clientWidth,
          scroll: style.overflowY,
          noOverlap: control.bottom <= rect.top,
          font: parseFloat(getComputedStyle(el.querySelector("pre")).fontSize),
          bar: getComputedStyle(el, "::-webkit-scrollbar").width,
        };
      }),
      {
        vertical: true,
        horizontal: true,
        scroll: "scroll",
        noOverlap: true,
        font: 13,
        bar: "12px",
      },
    );
    await area.hover();
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(150);
    assert.equal(await area.evaluate((el) => el.scrollTop > 0), true);
    const rect = await area.boundingBox();
    await area.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.mouse.move(rect.x + rect.width - 6, rect.y + 8);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width - 6, rect.y + rect.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    assert.equal(await area.evaluate((el) => el.scrollTop > 0), true);
    await area.evaluate((el) => {
      el.scrollLeft = 500;
    });
    assert.equal(await area.evaluate((el) => el.scrollLeft > 0), true);
    assert.deepEqual(await bounds(), before);
  }
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".code-panel").count(), 0);
  await page.getByRole("button", { name: "Code Hover for example" }).hover();
  await page.waitForTimeout(700);
  assert.equal(
    await page.locator(".solution-viewport").evaluate((el) => el.scrollTop),
    0,
  );
  await page.screenshot({ path: "/tmp/code-scroll.png" });
  console.log(
    "Verified full 400-line source, wheel scrolling, draggable scrollbar, horizontal scrolling, fixed 13px font, separate usable hover controls, reset scroll, no pagination, unchanged manual window bounds at three sizes; demo only.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
