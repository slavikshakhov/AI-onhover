import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-panel-fit-"));
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
  await page.getByRole("button", { name: "Skip", exact: true }).hover();
  await page.waitForTimeout(600);
  await page.locator("footer").hover();
  await page.getByRole("button", { name: "Explain Hold to ask" }).hover();
  await page.waitForTimeout(600);
  await page.locator("footer").hover();
  await page.waitForTimeout(1500);
  // A complete, intentionally spacious example. Compact equivalent preserves its logic.
  const full =
    "function sum(values) {\n  let total = 0;\n" +
    Array.from(
      { length: 10 },
      (_, i) => "  // Accumulate numeric values: note " + i,
    ).join("\n") +
    "\n  for (const value of values) {\n    total += value;\n  }\n  return total;\n}";
  const compact =
    "function sum(values) {\n  return values.reduce((total, value) => total + value, 0);\n}";
  await app.evaluate(
    ({ ipcMain }, fixture) => {
      globalThis.fitCalls = [];
      ipcMain.removeHandler("code");
      ipcMain.handle("code", (_e, version, selectedPath) => {
        globalThis.selectedRequest = { version, path: selectedPath };
        return {
          fitId: "fixture",
          answer: {
            title: "Sum",
            fragments: [],
            language: "JS",
            incomplete: false,
            code: fixture.full,
          },
        };
      });
      ipcMain.removeHandler("answer:compact");
      ipcMain.handle("answer:compact", (_e, scope, id, size) => {
        globalThis.fitCalls.push({ scope, id, size });
        return {
          answer: {
            title: "Sum",
            fragments: [],
            language: "JS",
            incomplete: false,
            code: fixture.compact,
          },
        };
      });
    },
    { full, compact },
  );
  const code = page.getByRole("button", { name: "Code Hover for example" });
  const resize = async (width, height) => {
    await app.evaluate(
      ({ BrowserWindow }, size) =>
        BrowserWindow.getAllWindows()[0].setSize(...size),
      [width, height],
    );
    await page.locator("footer").hover();
    await page.waitForTimeout(500);
  };
  const calls = () => app.evaluate(() => globalThis.fitCalls);
  const bounds = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );
  const check = async (label, expected, two = false) => {
    const first = await page.locator(".display-source code").textContent();
    if (two) {
      assert.equal(
        await page.locator(".code-page-navigation span").innerText(),
        "1 of 2",
      );
      const next = page.getByRole("button", { name: "Next", exact: true });
      await next.hover();
      await page.waitForTimeout(200);
      assert.equal(await page.locator(".dwell-action.arming i").count(), 1);
      assert.equal(
        await page.locator(".code-page-navigation span").innerText(),
        "1 of 2",
      );
      await page.waitForTimeout(400);
      assert.equal(
        await page.locator(".code-page-navigation span").innerText(),
        "2 of 2",
      );
      const second = await page.locator(".display-source code").textContent();
      assert.equal(first + "\n" + second, expected);
      await page.waitForTimeout(800);
      assert.equal(
        await page.locator(".code-page-navigation span").innerText(),
        "2 of 2",
      );
      assert.equal(await page.locator(".status").innerText(), "Ready");
      await page.locator("footer").hover();
      await page.getByRole("button", { name: "Back", exact: true }).hover();
      await page.waitForTimeout(600);
      assert.equal(
        await page.locator(".code-page-navigation span").innerText(),
        "1 of 2",
      );
      await page.locator("footer").hover();
    } else assert.equal(first, expected);
    const geometry = await page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const shell = rect(document.querySelector(".answer-shell"));
      const source = document.querySelector(".display-source");
      const r = rect(source);
      const area = document.querySelector(".solution-viewport");
      const controls = [
        ...document.querySelectorAll(
          ".panel-controls, .code-page-navigation, main > .controls, .screenshot-controls",
        ),
      ];
      return {
        fits:
          r.top >= shell.top &&
          r.bottom <= shell.bottom &&
          r.left >= shell.left &&
          r.right <= shell.right &&
          source.scrollWidth <= area.clientWidth + 1 &&
          source.scrollHeight <= area.clientHeight + 1,
        font: parseFloat(getComputedStyle(source).fontSize),
        noOverlap: controls.every((el) => {
          const c = rect(el);
          return c.bottom <= r.top || c.top >= r.bottom;
        }),
        noPageScroll:
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
      };
    });
    assert.deepEqual(geometry, {
      fits: true,
      font: 13,
      noOverlap: true,
      noPageScroll: true,
    });
    assert.equal(
      await page.getByRole("button", { name: /Next|Previous/ }).count(),
      two ? 1 : 0,
    );
    await page.screenshot({ path: `/tmp/panel-fit-${label}.png` });
  };
  await code.hover();
  await page.waitForTimeout(900);
  const initialBounds = await bounds();
  assert.equal(initialBounds.width, 480);
  assert.equal(initialBounds.height, 700);
  await check("default", full);
  assert.equal((await calls()).length, 0);
  await resize(420, 600);
  const smallBounds = await bounds();
  await check("small", full, true);
  assert.equal((await calls()).length, 0);
  assert.deepEqual(await bounds(), smallBounds);
  await resize(900, 950);
  await check("large", full);
  assert.equal((await calls()).length, 0);
  await resize(420, 600);
  await check("small-cached", full, true);
  assert.equal((await calls()).length, 0);
  // Exact deep selection and expanded tree survive navigation.
  await resize(900, 950);
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  await page
    .locator('.answer-panel:not(.details-layer) [data-path="0"] > button')
    .hover();
  await page.waitForTimeout(1200);
  await page.locator('.details-layer [data-path="0.0"] > button').hover();
  await page.waitForTimeout(1200);
  await page.locator('.details-layer [data-path="0.0.0"] > button').hover();
  await page.waitForTimeout(1200);
  const tree = await page.locator(".tree-content").innerHTML();
  await page.locator("footer").hover();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".tree-content").innerHTML(), tree);
  await page.screenshot({ path: "/tmp/panel-fit-bullets.png" });
  // Smaller panels retain the whole tree; if it cannot fit, its explicit message
  // replaces the visual tree while navigation remains in its own reserved row.
  await resize(420, 600);
  const branchFits = await page.locator(".tree-content").evaluate((el) => {
    const area = el.parentElement;
    return getComputedStyle(el).visibility === "hidden"
      ? !!area.querySelector('[role="alert"]')
      : el.getBoundingClientRect().height <= area.clientHeight + 1 &&
          el.scrollWidth <= area.clientWidth + 1;
  });
  assert.equal(branchFits, true);
  assert.equal(
    await page.getByRole("button", { name: "Hover to return" }).isVisible(),
    true,
  );
  await page.screenshot({ path: "/tmp/panel-fit-bullets-small.png" });
  await resize(480, 700);
  await page.screenshot({ path: "/tmp/panel-fit-bullets-default.png" });
  await resize(900, 950);
  assert.equal(await page.locator(".tree-content").innerHTML(), tree);

  await code.hover();
  await page.waitForTimeout(800);
  assert.deepEqual(
    (await app.evaluate(() => globalThis.selectedRequest)).path,
    [0, 0, 0],
  );
  await page.getByRole("button", { name: "Return to explanation" }).hover();
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".tree-content").innerHTML(), tree);
  // An impossible complete version is never displayed partially, nor retried on resize.
  await page.getByRole("button", { name: "New topic Hover 1 sec" }).hover();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Explain Hold to ask" }).hover();
  await page.waitForTimeout(600);
  await page.locator("footer").hover();
  await page.waitForTimeout(1500);
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("code");
    const answer = {
      title: "Large",
      code: "required();\n".repeat(400),
      fragments: [],
      language: "JS",
      incomplete: false,
    };
    ipcMain.handle("code", () => ({ fitId: "oversized", answer }));
    ipcMain.removeHandler("answer:compact");
    ipcMain.handle("answer:compact", () => {
      globalThis.fitCalls.push("oversized");
      return { answer };
    });
  });
  await resize(420, 600);
  await code.hover();
  await page.waitForTimeout(900);
  assert.equal(await page.locator(".display-source").count(), 0);
  assert.match(await page.locator(".fit-message").innerText(), /Enlarge/);
  const attempts = (await calls()).length;
  await resize(480, 700);
  assert.equal((await calls()).length, attempts);
  await page.screenshot({ path: "/tmp/panel-fit-limit.png" });
  console.log(
    "Panel fitting passed: 480×700 full unchanged/no request; 420×600 exactly two lossless pages; 900×950 full restored; 500ms once-per-entry navigation; no auto-resize, scrolling or overlap; exact deep selection/tree restored; impossible fit gives an explicit message.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
