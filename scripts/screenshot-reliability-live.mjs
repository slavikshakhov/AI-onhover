import "./check-node.mjs";
import "dotenv/config";
import { _electron as electron } from "@playwright/test";
import { Topic } from "../dist-electron/electron/service.js";
import { cases } from "../tests/fixtures/reliability-cases.mjs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
// Opt-in, billable. Only committed synthetic fixtures are sent or saved.
// Candidate code is NEVER executed. Implementation quality requires manual review.
if (!process.env.OPENAI_API_KEY) throw new Error("API key is not configured.");
const profile = await mkdtemp(path.join(tmpdir(), "reliability-live-"));
delete process.env.ELECTRON_RUN_AS_NODE;
let app;
const results = [];
try {
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, DEMO_MODE: "1", VITE_DEV_SERVER_URL: "" },
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1100, 800),
  );
  const selected = process.argv[2];
  for (const fixture of cases.filter((c) => !selected || c.name === selected)) {
    // textContent avoids interpreting fixture markup as HTML.
    await page.setContent(
      '<main style="background:white;color:black;padding:22px;font:20px sans-serif"><p></p><pre style="font:15px/1.5 monospace;white-space:pre-wrap"></pre></main>',
    );
    await page
      .locator("p")
      .evaluate((el, text) => (el.textContent = text), fixture.description);
    await page
      .locator("pre")
      .evaluate((el, text) => (el.textContent = text), fixture.code);
    const image =
      "data:image/png;base64," + (await page.screenshot()).toString("base64");
    const metadata = [];
    const syntheticStages = [];
    const transport = async (url, options) => {
      if (String(url).endsWith("/transcriptions"))
        return new Response(JSON.stringify({ text: fixture.question }));
      const response = await fetch(url, options);
      const data = await response.clone().json();
      if (
        ["screenshot_requirements", "screenshot_review"].includes(
          JSON.parse(options.body).text.format.name,
        )
      )
        syntheticStages.push(data.output);
      metadata.push({
        stage: JSON.parse(options.body).text.format.name,
        model: data.model,
        status: data.status,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      });
      return response;
    };
    const topic = new Topic(
      false,
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_TEXT_MODEL,
      process.env.OPENAI_TRANSCRIBE_MODEL,
      transport,
      process.env.OPENAI_REVIEW_MODEL,
    );
    topic.setImage(image);
    const start = Date.now();
    const result = await topic.ask({
      id: crypto.randomUUID(),
      mode: "code",
      budget: { lines: 8, columns: 90, fragments: 4 },
      audio: new Uint8Array([1]),
      mime: "audio/webm",
    });
    let compact;
    if (result.answer?.code)
      compact = await topic.compact(result.fitId, { width: 380, height: 200 });
    results.push({
      name: fixture.name,
      expected: fixture.reviewCases ?? fixture.expectedOutputs,
      answer: result.answer,
      error: result.error,
      compact: compact?.answer,
      compactError: compact?.error,
      elapsedMs: Date.now() - start,
      requests: metadata,
      syntheticStages,
    });
    await writeFile(
      "/tmp/screenshot-reliability-synthetic-results.json",
      JSON.stringify(results, null, 2),
    );
    console.log(
      JSON.stringify({
        case: fixture.name,
        model: metadata[0]?.model,
        requests: metadata.length,
        status: result.error ? "pipeline-fail" : "requires-quality-review",
        elapsedMs: Date.now() - start,
      }),
    );
  }
  await writeFile(
    "/tmp/screenshot-reliability-synthetic-results.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
}
