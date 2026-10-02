import "./check-node.mjs";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

assert.equal(
  process.platform,
  "darwin",
  "This test verifies the macOS LaunchServices workflow",
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const launch = () => {
  const child = spawn(npm, ["run", "dev"], {
    env: { ...process.env, DEMO_MODE: "0", HOVER_DEV_DEBUG_PORT: "9333" },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.done = once(child, "exit");
  child.output = () => output;
  return child;
};
async function connect(child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, "dev exited before app readiness");
    try {
      const browser = await chromium.connectOverCDP("http://127.0.0.1:9333", {
        timeout: 500,
      });
      for (let ready = 0; ready < 100; ready++) {
        const page = browser
          .contexts()[0]
          .pages()
          .find((p) => p.url().startsWith("http://127.0.0.1:5173"));
        if (page) {
          await page.waitForSelector(".target.capture");
          return { browser, page };
        }
        await delay(100);
      }
      throw new Error("app window did not load");
    } catch {
      await delay(200);
    }
  }
  throw new Error("dev app did not become ready");
}
const signal = (child) => {
  try {
    process.kill(-child.pid, "SIGINT");
  } catch {}
};
const waitExit = async (child) =>
  Promise.race([
    child.done,
    delay(10000).then(() => {
      throw new Error("dev shutdown timed out");
    }),
  ]);
let child;
try {
  child = launch();
  let { browser } = await connect(child);
  const duplicate = launch();
  const [code] = await waitExit(duplicate);
  assert.notEqual(code, 0);
  assert.match(duplicate.output(), /5173.*already in use/);
  await browser.close();
  execFileSync(process.execPath, ["scripts/dev-capture-flow.mjs"], {
    stdio: "inherit",
  });
  signal(child);
  await waitExit(child);
  await delay(500);
  assert.equal(
    await fetch("http://127.0.0.1:5173").then(
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal(
    await fetch("http://127.0.0.1:9333/json/version").then(
      () => true,
      () => false,
    ),
    false,
  );
  // A new invocation must start immediately, with no orphan or stale single-instance lock.
  child = launch();
  const connected = await connect(child);
  await connected.page.evaluate(() => window.close());
  await waitExit(child);
  await connected.browser.close();
  assert.equal(
    await fetch("http://127.0.0.1:5173").then(
      () => true,
      () => false,
    ),
    false,
  );
  console.log(
    "Dev lifecycle passed: duplicate rejected, real capture passed, Ctrl+C stops app/server, restart succeeds, closing app stops server.",
  );
} catch (error) {
  console.error(
    child
      ?.output()
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("[screen-capture]") ||
          line.includes("startup failed"),
      )
      .join("\n"),
  );
  throw error;
} finally {
  if (child) signal(child);
}
