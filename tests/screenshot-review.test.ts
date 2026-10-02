import { it, expect, vi } from "vitest";
import {
  reviewedScreenshot,
  parseStructured,
  type Requirements,
  requirementChecks,
} from "../electron/screenshot-review";
import { Topic } from "../electron/service";
const req: Requirements = {
  intent: "implement",
  behavior: ["Merge overlapping intervals"],
  signature: "mergeIntervals(intervals)",
  inputs: [],
  outputFormat: [],
  ordering: ["Ascending starts"],
  mutation: ["Preserve input array and nested intervals"],
  performance: [],
  examples: ["[[3,6],[1,4]] -> [[1,6]]"],
  missing: [],
  essentialUnreadable: false,
};
const answer = {
  title: "",
  code: "function mergeIntervals(xs) { return xs; }",
  language: "",
  fragments: [],
  incomplete: false,
  intent: "implement" as const,
};
const audit = (verdict = "pass", issues: string[] = []) => ({
  verdict,
  issues,
  checks: requirementChecks(req)
    .map((c) => ({ ...c, satisfied: true, evidence: "Synthetic check" }))
    .map(({ text, ...c }) => c),
  cases: [{ input: "fixture", expected: "same", observed: "same" }],
  timeComplexity: "O(n)",
});
it("extracts before generation, reviews the actual candidate and makes only one correction then verifies it", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(req)
    .mockResolvedValueOnce(audit("needs_correction", ["Does not merge"]))
    .mockResolvedValueOnce(audit());
  const generate = vi
    .fn()
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce({
      ...answer,
      code: "corrected synthetic candidate",
    });
  const result = await reviewedScreenshot(
    request,
    generate,
    "Implement this",
    [],
  );
  expect(generate.mock.calls[0][0]).toContain("nested intervals");
  expect(request.mock.calls[1][3]).toMatchObject({
    candidate: answer.code,
    requirements: req,
  });
  expect(request.mock.calls[2][3]).toMatchObject({
    candidate: "corrected synthetic candidate",
  });
  expect(generate).toHaveBeenCalledTimes(2);
  expect(result.answer.code).toBe("corrected synthetic candidate");
});
it("fails closed if the corrected candidate still fails; never retries", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(req)
    .mockResolvedValue(audit("needs_correction", ["Mutation"]));
  const generate = vi.fn().mockResolvedValue(answer);
  await expect(
    reviewedScreenshot(request, generate, "Implement", []),
  ).rejects.toThrow("after one correction");
  expect(generate).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledTimes(3);
});
it("requests a clearer screenshot without generating when essential text is unreadable", async () => {
  const generate = vi.fn();
  const result = await reviewedScreenshot(
    vi.fn().mockResolvedValue({ ...req, essentialUnreadable: true }),
    generate,
    "Implement",
    [],
  );
  expect(result.answer.intent).toBe("clarify");
  expect(generate).not.toHaveBeenCalled();
});
it("analyzes completed output code as written without implementation review", async () => {
  const request = vi.fn().mockResolvedValue({ ...req, intent: "output" });
  const result = await reviewedScreenshot(
    request,
    vi.fn().mockResolvedValue({ ...answer, intent: "output", code: "" }),
    "What prints?",
    [],
  );
  expect(result.answer.intent).toBe("output");
  expect(request).toHaveBeenCalledOnce();
});
it.each([
  { status: "incomplete", output: [] },
  { status: "completed", output: [] },
])("rejects truncated or invalid structured output", (data) => {
  expect(() => parseStructured(data)).toThrow();
});
it("uses the identical full screenshot in extraction, generation, review; keeps replacement isolated", async () => {
  const calls: any[] = [];
  const transport = vi.fn(async (_url: unknown, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const name = body.text.format.name;
    const value =
      name === "screenshot_requirements"
        ? req
        : name === "screenshot_review"
          ? audit()
          : { ...answer, outputs: [], approach: "", complexity: "" };
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(value) }] },
        ],
      }),
    );
  });
  const topic = new Topic(false, "fake", undefined, undefined, transport);
  topic.setSessionContext("Angular and TypeScript; Java and Spring Boot");
  topic.setImage("data:image/png;base64,FULL_REGION");
  const full = await topic.analyzeScreenshot({
    lines: 8,
    columns: 80,
    fragments: 4,
  });
  expect(full.error).toBeUndefined();
  expect(calls.map((x) => x.text.format.name)).toEqual([
    "screenshot_requirements",
    "compact_answer",
    "screenshot_review",
  ]);
  expect(
    JSON.parse(calls[1].input.at(-1).content[0].text).requirements,
  ).toEqual(req);
  for (const call of calls) {
    expect(call.instructions).toContain("Angular and TypeScript");
    expect(call.instructions).toContain(
      "never an override of explicit questions or visible screenshot requirements",
    );
    expect(call.model).toBe(
      call.text.format.name === "screenshot_review"
        ? "gpt-4.1"
        : "gpt-4.1-mini",
    );
    expect(call.store).toBe(false);
    expect(call.input.at(-1).content.at(-1)).toEqual({
      type: "input_image",
      image_url: "data:image/png;base64,FULL_REGION",
      detail: "high",
    });
  }
  expect(topic.history).toHaveLength(1);
  topic.setImage("data:image/png;base64,REPLACEMENT");
  await topic.analyzeScreenshot({ lines: 8, columns: 80, fragments: 4 });
  const extraction = calls.at(-3);
  expect(JSON.parse(extraction.input[0].content[0].text).history).toEqual([]);
});

it("does not trust a pass verdict whose traced result contradicts its expected result", async () => {
  const inconsistent = {
    ...audit(),
    cases: [
      {
        input: "[a,b,a] distinct equal-timestamp records",
        expected: "[a]",
        observed: "[b]",
      },
    ],
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce(req)
    .mockResolvedValueOnce(inconsistent)
    .mockResolvedValueOnce(audit());
  const generate = vi.fn().mockResolvedValue(answer);
  await reviewedScreenshot(request, generate, "Implement", []);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0]).toContain(
    "expected [a] but candidate yields [b]",
  );
});
it("rejects a review that omits a required nested-mutation check", async () => {
  const partial = {
    ...audit(),
    checks: audit().checks.filter((c) => !c.id.startsWith("mutation:")),
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce(req)
    .mockResolvedValueOnce(partial);
  const generate = vi.fn().mockResolvedValue(answer);
  await expect(
    reviewedScreenshot(request, generate, "Implement", []),
  ).rejects.toThrow("Incomplete solution review");
  expect(generate).toHaveBeenCalledOnce();
});
it("checks the compact candidate, not the prior full candidate, without extracting requirements again", async () => {
  const request = vi.fn().mockResolvedValue(audit());
  const compact = { ...answer, code: "compact synthetic candidate" };
  await reviewedScreenshot(
    request,
    vi.fn().mockResolvedValue(compact),
    "Compact",
    [],
    req,
  );
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toBe("screenshot_review");
  expect(request.mock.calls[0][3].candidate).toBe(compact.code);
});
