import "./check-node.mjs";
import { _electron as electron } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "hover-output-test-"));
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
  const capture = page.locator(".target.capture");
  const ask = page.locator(".screenshot-ask");
  // Provider fixture: many requested outputs must remain reachable in a small panel.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("screenshot:analyze");
    ipcMain.handle("screenshot:analyze", () => ({
      id: "initial",
      answer: {
        intent: "output",
        title: "Execution results",
        code: "",
        language: "",
        incomplete: false,
        fragments: [],
        outputs: [
          ...Array.from({ length: 10 }, (_, i) => ({
            label: `Output ${i + 1}`,
            kind: "value",
            value: String(i),
            reason:
              "the loop prints the current counter before incrementing it",
          })),
          {
            label: "Output 11",
            kind: "exception",
            value: "TypeError",
            reason: "the argument evaluation throws before printing",
          },
          {
            label: "Output 12",
            kind: "not-reached",
            value: "",
            reason: "the uncaught TypeError prevents this output",
          },
        ],
      },
    }));
  });
  await page.locator("footer").hover();
  const outputSelectorPromise = app.waitForEvent("window");
  await capture.hover();
  const outputSelector = await outputSelectorPromise;
  await outputSelector.waitForSelector("#screen");
  await outputSelector.waitForTimeout(300);
  await outputSelector.mouse.move(60, 120);
  await outputSelector.mouse.down();
  await outputSelector.mouse.move(620, 310, { steps: 10 });
  await outputSelector.mouse.up();
  await page.waitForSelector(".screenshot-attached img");
  await page.locator(".output-results").waitFor({ state: "attached" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(420, 600),
  );
  const outputItems = page.locator(".output-results li");
  assert.equal(await outputItems.count(), 12);
  assert.match(
    await outputItems.nth(10).textContent(),
    /^Output 11: throws TypeError —/,
  );
  assert.match(
    await outputItems.nth(11).textContent(),
    /^Output 12: not reached —/,
  );
  assert.equal(await page.locator(".code-panel pre").count(), 0);
  assert.equal(
    await page
      .locator(".code-panel")
      .getByText(/Incomplete snippet/)
      .count(),
    0,
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 950),
  );
  await page.waitForFunction(() => {
    const el = document.querySelector(".screenshot-content");
    return (
      el.scrollHeight <= el.clientHeight + 1 &&
      el.scrollWidth <= el.clientWidth + 1
    );
  });
  await outputItems.last().waitFor({ state: "visible" });
  assert.equal(
    await page
      .locator(".screenshot-content")
      .evaluate((el) =>
        ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      ),
    false,
  );
  console.log(
    "Automatic screenshot output rendering passed: 12 ordered results, exception and unreachable output, no code/incomplete label, manual enlargement without scrolling.",
  );
  const short =
    "function sumPositive(values) {\n  return values.reduce((sum, n) => sum + Math.max(0, n), 0);\n}";
  const longer = [
    "function shortestPath(graph, start, end) {",
    "  const queue = [start];",
    "  const previous = new Map([[start, null]]);",
    "  let head = 0;",
    "  while (head < queue.length) {",
    "    const current = queue[head++];",
    "    if (current === end) break;",
    "    const neighbors = graph[current] || [];",
    "    for (const neighbor of neighbors) {",
    "      if (previous.has(neighbor)) continue;",
    "      previous.set(neighbor, current);",
    "      queue.push(neighbor);",
    "    }",
    "  }",
    "  if (!previous.has(end)) return null;",
    "  const path = [];",
    "  let current = end;",
    "  while (current !== null) {",
    "    path.push(current);",
    "    current = previous.get(current);",
    "  }",
    "  path.reverse();",
    "  return path;",
    "}",
  ].join("\n");
  for (const source of [short, longer]) {
    await app.evaluate(({ BrowserWindow, ipcMain }, code) => {
      BrowserWindow.getAllWindows()[0].setSize(420, 600);
      ipcMain.removeHandler("screenshot:ask");
      ipcMain.handle("screenshot:ask", (_event, _shotId, request) => ({
        id: request.id,
        answer: {
          intent: "implement",
          title: "Unwanted heading",
          code,
          language: "JavaScript",
          incomplete: false,
          outputs: [],
          approach: "Unwanted analysis",
          complexity: "Unwanted complexity",
          fragments: ["Unwanted explanation"],
        },
      }));
    }, source);
    await page.locator("footer").hover();
    await ask.hover();
    await page.waitForTimeout(900);
    await page.locator("footer").hover();
    await page.waitForTimeout(700);
    await page.waitForFunction(
      (source) =>
        document.querySelector(".solution-text code")?.textContent === source,
      source,
    );
    assert.equal(await page.locator(".display-source").innerText(), source);
    assert.equal(
      await page
        .locator(".solution-panel h1, .solution-panel ul, .solution-panel nav")
        .count(),
      0,
    );
    assert.equal(await page.locator(".solution-limit").count(), 0);
    const layout = await page.locator(".solution-viewport").evaluate((el) => ({
      overflow: getComputedStyle(el).overflow,
      fits:
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollWidth <= el.clientWidth + 1,
      font: parseFloat(
        getComputedStyle(el.querySelector(".display-source")).fontSize,
      ),
    }));
    assert.equal(await page.locator(".code-page-navigation").count(), 0);
    assert.equal(
      await page
        .locator(".solution-viewport")
        .evaluate((el) => getComputedStyle(el).overflowY),
      "scroll",
    );
    assert.ok(layout.font >= 13);
    const bounds = await app.evaluate(({ BrowserWindow }) => ({
      bounds: BrowserWindow.getAllWindows()[0].getBounds(),
    }));
    assert.equal(bounds.bounds.width, 420);
    assert.equal(bounds.bounds.height, 600);
    console.log(
      `Complete solution UI passed: ${source === short ? "short" : "longer"}, all source visible at ${layout.font}px, ${bounds.bounds.width}×${bounds.bounds.height}, continuous source with scrolling, no headings or pages.`,
    );
  }
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
