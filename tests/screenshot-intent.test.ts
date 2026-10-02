import { withReviewFixture } from "./review-fixture";
import { expect, it, vi } from "vitest";
import { Topic } from "../electron/service";
import { screenshotAnswerContract } from "../electron/answer-contract";
import { screenshotAnswerSchema } from "../src/shared";

// Transport fixtures represent two attachments; model responses are mocked.
const unfinished = "function sumPositive(values) {\n  // Your solution here\n}";
const solution = [
  "function sumPositive(values) {",
  "  let total = 0;",
  "",
  "  for (const value of values) {",
  "    if (value > 0) {",
  "      total += value;",
  "    }",
  "  }",
  "",
  "  return total;",
  "}",
].join("\n");
const imageFor = (source: string) =>
  `data:image/png;base64,${Buffer.from(source).toString("base64")}`;
const emptyImage = imageFor(unfinished);
const completeImage = imageFor(solution);
const implementation = {
  intent: "implement",
  approach: "",
  complexity: "",
  title: "",
  code: solution,
  language: "",
  incomplete: false,
  outputs: [],
  fragments: [],
};
const outputAnswer = (value: string) => ({
  intent: "output",
  approach: "",
  complexity: "",
  title: "Current return value",
  code: "",
  language: "",
  incomplete: false,
  fragments: [],
  outputs: [
    {
      label: "sumPositive([-2, 1, 3])",
      kind: "value",
      value,
      reason:
        value === "undefined"
          ? "empty function has no return statement"
          : "adds only the positive values",
    },
  ],
});
it("keeps the current transcript paired with the same unfinished image for implement versus current-return requests, then uses the replacement image", async () => {
  const speech = [
    "Implement this function",
    "What does this code currently return?",
    "What does this code currently return?",
  ];
  const answers = [
    implementation,
    outputAnswer("undefined"),
    outputAnswer("4"),
  ];
  const requests: any[] = [];
  let turn = 0;
  const transport = vi.fn(async (url: unknown, init: any) => {
    if (String(url).endsWith("transcriptions")) {
      expect(init.body).toBeInstanceOf(FormData);
      expect(await (init.body.get("file") as Blob).arrayBuffer()).toEqual(
        new Uint8Array([10, 20, turn]).buffer,
      );
      return new Response(JSON.stringify({ text: `  ${speech[turn]}  ` }));
    }
    const request = JSON.parse(init.body);
    requests.push(request);
    expect(request.input.at(-1).content).toEqual([
      { type: "input_text", text: expect.any(String) },
      {
        type: "input_image",
        image_url: turn < 2 ? emptyImage : completeImage,
        detail: "high",
      },
    ]);
    expect(JSON.parse(request.input.at(-1).content[0].text).question).toBe(
      speech[turn],
    );
    const answer = answers[turn++];
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
        ],
      }),
    );
  });
  const topic = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(transport),
  );
  topic.setImage(emptyImage);
  for (let i = 0; i < 3; i++) {
    if (i === 2) topic.setImage(completeImage);
    const result = await topic.ask({
      id: String(i),
      mode: "code",
      audio: new Uint8Array([10, 20, i]),
      mime: "audio/webm",
      budget: { lines: 1, columns: 16, fragments: 1 },
    });
    expect(result.answer).toEqual(answers[i]);
    if (i === 0)
      expect(
        (await topic.shorten("0", { lines: 1, columns: 16, fragments: 1 }))
          .answer?.code,
      ).toBe(solution);
  }
  expect(requests[1].input).toHaveLength(3); // Prior implementation is context, not the new task.
  expect(requests[2].input).toHaveLength(1); // Replacement drops old screenshot context.
  expect(
    requests[0].text.format.schema.properties.code.pattern,
  ).toBeUndefined();
  expect(solution.split("\n").length).toBeGreaterThan(8);
});
it("has explicit intent routing, placeholder completion, vague-challenge default, and requirements/example checks", () => {
  const { instructions, schema } = screenshotAnswerContract({
    lines: 1,
    columns: 16,
    fragments: 1,
  });
  expect(schema.required).toContain("intent");
  for (const rule of [
    "CURRENT spoken request",
    "default to implement",
    "EXACTLY AS WRITTEN",
    "ALL visible examples",
    "Preserve the required function name",
    "Never execute code",
    "no-code rule for output analysis MUST NOT apply",
    "For debug:",
    "For explain:",
  ])
    expect(instructions).toContain(rule);
});
it("rejects a missing solution for an implementation or fix, but accepts empty-code current-output analysis and genuine missing requirements", () => {
  expect(screenshotAnswerSchema.safeParse(implementation).success).toBe(true);
  expect(
    screenshotAnswerSchema.safeParse({ ...implementation, code: "" }).success,
  ).toBe(false);
  expect(
    screenshotAnswerSchema.safeParse({
      ...implementation,
      intent: "debug",
      code: "",
    }).success,
  ).toBe(false);
  expect(
    screenshotAnswerSchema.safeParse(outputAnswer("undefined")).success,
  ).toBe(true);
  expect(
    screenshotAnswerSchema.safeParse({
      ...implementation,
      code: "",
      incomplete: true,
      fragments: ["Required return behavior is cropped out."],
    }).success,
  ).toBe(true);
});
it.each(["explain", "debug"] as const)(
  "accepts a screenshot %s response without forcing output analysis",
  async (intent) => {
    const answer =
      intent === "debug"
        ? {
            ...implementation,
            intent,
            fragments: [],
          }
        : {
            ...implementation,
            intent,
            code: "",
            language: "",
            fragments: [
              "An accumulator keeps a running sum.",
              "A condition filters out nonpositive values.",
            ],
          };
    const transport = vi.fn(
      async (url: unknown) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("transcriptions")
              ? {
                  text:
                    intent === "debug"
                      ? "Fix this function"
                      : "Explain the relevant concepts",
                }
              : {
                  status: "completed",
                  output: [
                    {
                      content: [
                        { type: "output_text", text: JSON.stringify(answer) },
                      ],
                    },
                  ],
                },
          ),
        ),
    );
    const topic = new Topic(
      false,
      "fake",
      undefined,
      undefined,
      withReviewFixture(transport),
    );
    topic.setImage(emptyImage);
    const result = await topic.ask({
      id: intent,
      mode: "code",
      budget: { lines: 1, columns: 16, fragments: 1 },
      audio: new Uint8Array([1]),
      mime: "audio/webm",
    });
    expect(result.answer).toEqual(answer);
  },
);
it("drops a stale transcript when the attachment changes before transcription completes", async () => {
  let finish!: (response: Response) => void;
  const transport = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const topic = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(transport),
  );
  topic.setImage(emptyImage);
  const pending = topic.ask({
    id: "stale",
    mode: "code",
    budget: { lines: 1, columns: 16, fragments: 1 },
    audio: new Uint8Array([1]),
    mime: "audio/webm",
  });
  topic.setImage(completeImage);
  finish(new Response(JSON.stringify({ text: "Implement this function" })));
  expect((await pending).empty).toBe(true);
  expect(transport).toHaveBeenCalledTimes(1); // No model request pairs old speech with the new image.
});
