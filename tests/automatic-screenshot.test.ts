import { withReviewFixture } from "./review-fixture";
import { expect, it, vi } from "vitest";
import { Topic } from "../electron/service";
const budget = { lines: 8, columns: 60, fragments: 4 };
const implementation = {
  intent: "implement",
  title: "",
  code: "function add(a, b) { return a + b; }",
  language: "",
  incomplete: false,
  outputs: [],
  fragments: [],
  approach: "",
  complexity: "",
};
const output = {
  ...implementation,
  intent: "output",
  code: "",
  outputs: [{ label: "A", kind: "value", value: "3", reason: "" }],
};
const response = (answer: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
      ],
    }),
  );
it.each([implementation, output])(
  "automatically analyzes once without audio, preserves all screenshot follow-ups, and clears on replacement",
  async (answer) => {
    const requests: any[] = [];
    const transport = vi.fn(async (url: unknown, init: any) => {
      if (String(url).endsWith("transcriptions"))
        return new Response(
          JSON.stringify({ text: "Now handle negative inputs too" }),
        );
      requests.push(JSON.parse(init.body));
      return response(answer);
    });
    const topic = new Topic(
      false,
      "fake",
      undefined,
      undefined,
      withReviewFixture(transport),
    );
    topic.setImage("data:image/png;base64,CHALLENGE");
    const first = topic.analyzeScreenshot(budget);
    expect(topic.analyzeScreenshot(budget)).toBe(first);
    expect((await first).answer).toEqual(answer);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(requests[0].input[0].content[0].text).toContain(
      "No spoken instruction",
    );
    expect(requests[0].input[0].content[1].image_url).toBe(
      "data:image/png;base64,CHALLENGE",
    );
    for (let i = 0; i < 8; i++)
      await topic.ask({
        id: String(i),
        mode: "code",
        budget,
        audio: new Uint8Array([1]),
        mime: "audio/webm",
      });
    expect(topic.history).toHaveLength(9);
    expect(requests.at(-1).input[0].content).toContain("Automatically analyze");
    expect(
      JSON.parse(requests.at(-1).input.at(-1).content[0].text).question,
    ).toBe("Now handle negative inputs too");
    expect(requests.at(-1).input.at(-1).content[1].image_url).toBe(
      "data:image/png;base64,CHALLENGE",
    );
    const count = transport.mock.calls.length;
    await topic.analyzeScreenshot(budget);
    expect(transport).toHaveBeenCalledTimes(count);
    topic.setImage("data:image/png;base64,REPLACEMENT");
    await topic.analyzeScreenshot(budget);
    expect(topic.history).toHaveLength(1);
    expect(requests.at(-1).input).toHaveLength(1);
  },
);
it("does not retry failed initial analysis and ignores late responses after reset", async () => {
  const failing = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { message: "Unavailable" } }), {
        status: 503,
      }),
  );
  const topic = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(failing),
  );
  topic.setImage("data:image/png;base64,TEST");
  expect((await topic.analyzeScreenshot(budget)).error).toBeTruthy();
  await topic.analyzeScreenshot(budget);
  expect(failing).toHaveBeenCalledTimes(1);
  let resolve!: (r: Response) => void;
  const slow = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    (() =>
      new Promise<Response>((r) => {
        resolve = r;
      })) as typeof fetch,
  );
  slow.setImage("data:image/png;base64,TEST");
  const pending = slow.analyzeScreenshot(budget);
  slow.reset();
  resolve(response(implementation));
  expect((await pending).answer).toBeUndefined();
  expect(slow.history).toEqual([]);
});
it("supports a single concise clarification when task information is insufficient", async () => {
  const answer = {
    ...output,
    intent: "clarify",
    outputs: [],
    fragments: ["What should this function return?"],
  };
  const topic = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(vi.fn(async () => response(answer))),
  );
  topic.setImage("data:image/png;base64,UNCLEAR");
  expect((await topic.analyzeScreenshot(budget)).answer).toEqual(answer);
});

it("ignores a replaced screenshot response even when its transport ignores abort", async () => {
  let finishOld!: (r: Response) => void;
  let calls = 0;
  const transport = vi.fn(() =>
    ++calls === 1
      ? new Promise<Response>((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve(response(output)),
  );
  const topic = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(transport),
  );
  topic.setImage("data:image/png;base64,OLD");
  const old = topic.analyzeScreenshot(budget);
  await vi.waitFor(() => expect(finishOld).toBeTypeOf("function"));
  topic.setImage("data:image/png;base64,NEW");
  expect((await topic.analyzeScreenshot(budget)).answer).toEqual(output);
  finishOld(response(implementation));
  expect((await old).answer).toBeUndefined();
  expect(topic.history).toHaveLength(1);
  expect(topic.history[0].answer).toEqual(output);
});

it("compacts a screenshot solution once with the current image and complete behavior preserved in the contract", async () => {
  const calls: any[] = [];
  const transport = vi.fn(async (_url: unknown, init: any) => {
    calls.push(JSON.parse(init.body));
    return response(implementation);
  });
  const topic = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(transport),
  );
  topic.setImage("data:image/png;base64,CHALLENGE");
  const full = await topic.analyzeScreenshot(budget);
  await topic.compact(full.fitId!, { width: 350, height: 200 });
  await topic.compact(full.fitId!, { width: 600, height: 500 });
  expect(calls).toHaveLength(2);
  expect(calls[1].instructions).toContain(
    "Preserve ALL required challenge behavior",
  );
  expect(calls[1].input.at(-1).content[1].image_url).toBe(
    "data:image/png;base64,CHALLENGE",
  );
  expect(topic.history).toHaveLength(1);
  expect(await topic.analyzeScreenshot(budget)).toEqual(full);
  topic.setImage("data:image/png;base64,NEXT");
  expect(
    (await topic.compact(full.fitId!, { width: 350, height: 200 })).error,
  ).toBeTruthy();
});
