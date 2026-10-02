import "./check-node.mjs";
import "dotenv/config";
import { _electron as electron } from "@playwright/test";
import { Topic } from "../dist-electron/electron/service.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// Opt-in live Responses calls; transcription is supplied by a fixture, never recorded.
assert.ok(
  process.env.OPENAI_API_KEY,
  "Configure OPENAI_API_KEY before this opt-in live test.",
);
const profile = await mkdtemp(path.join(tmpdir(), "hover-intent-live-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
let transcript = "";
const transport = (url, options) =>
  String(url).endsWith("/transcriptions")
    ? Promise.resolve(new Response(JSON.stringify({ text: transcript })))
    : fetch(url, options);
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 700),
  );
  const image = async (completed) => {
    await page.setContent(`<main style="background:white;color:black;font:22px monospace;padding:24px">
      ${completed ? "<h2>JavaScript</h2>" : "<h2>Sum positive values</h2><p>Complete sumPositive(values). Return the sum of strictly positive numbers in the array. Do not modify the input.</p><p>Examples: [] → 0; [-2, 1, 3] → 4; [-4, -1] → 0.</p>"}
      <pre>${completed ? "function sumPositive(values) {\n  let total = 0;\n  for (const value of values) {\n    if (value > 0) total += value;\n  }\n  return total;\n}" : "function sumPositive(values) {\n  // Your solution here\n}"}\n\nconsole.log(sumPositive([-2, 1, 3]));</pre></main>`);
    return (
      "data:image/png;base64," + (await page.screenshot()).toString("base64")
    );
  };
  const topic = new Topic(
    false,
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_TEXT_MODEL,
    process.env.OPENAI_TRANSCRIBE_MODEL,
    transport,
  );
  topic.setImage(await image(false));
  const cases = [
    ["Automatic unfinished challenge", "implement"],
    [
      "What does the original code in the screenshot currently return?",
      "output",
    ],
    [
      "Rewrite your solution using reduce, keeping the same behavior",
      "implement",
    ],
    ["Automatic completed code", "output"],
  ];
  for (let i = 0; i < cases.length; i++) {
    if (i === 3) topic.setImage(await image(true));
    const [question, intent] = cases[i];
    transcript = question;
    const result =
      i === 0 || i === 3
        ? await topic.analyzeScreenshot({ lines: 1, columns: 16, fragments: 1 })
        : await topic.ask({
            id: String(i),
            mode: "code",
            budget: { lines: 1, columns: 16, fragments: 1 },
            audio: new Uint8Array([1]),
            mime: "audio/webm",
          });
    assert.ok(result.answer, result.error);
    assert.equal(result.answer.intent, intent);
    assert.equal(result.answer.incomplete, false);
    if (intent === "implement") {
      if (i === 2) assert.match(result.answer.code, /reduce/);
      assert.equal(result.answer.title, "");
      assert.equal(result.answer.approach, "");
      assert.equal(result.answer.complexity, "");
      assert.deepEqual(result.answer.fragments, []);
      assert.match(result.answer.code, /sumPositive\s*\(\s*values\s*\)/);
      assert.doesNotMatch(result.answer.code, /Your solution here|TODO/);
      console.log(`LIVE ${question}: ${intent}\n${result.answer.code}`);
    } else {
      assert.equal(result.answer.code, "");
      assert.ok(result.answer.outputs.every((output) => output.reason === ""));
      assert.ok(
        result.answer.outputs.some(
          (output) =>
            output.kind === "value" &&
            output.value === (i === 1 ? "undefined" : "4"),
        ),
      );
      console.log(`LIVE ${question}: ${intent}; expected value confirmed.`);
    }
  }
  console.log(
    "Live intent checks passed. Synthetic challenge images only; fixture transcription; no screenshot code executed.",
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
