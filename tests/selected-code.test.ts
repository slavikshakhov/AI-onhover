import { it, expect, vi } from "vitest";
import { Topic } from "../electron/service";
const summary = {
  title: "TypeScript arrays",
  fragments: ["Ordered collections"],
  code: "",
  language: "",
  incomplete: false,
};
const budget = { lines: 5, columns: 40, fragments: 2 };
const req = {
  id: "first",
  mode: "explain" as const,
  budget,
  audio: new Uint8Array([1]),
  mime: "audio/webm" as const,
};
function harness(
  codeAnswer = {
    ...summary,
    title: "Stable item order",
    code: "const values: number[] = [1, 2];",
    language: "TypeScript",
  },
  status = "completed",
) {
  const calls: any[] = [];
  const transport = vi.fn(async (url: unknown, init: any) => {
    if (String(url).endsWith("transcriptions"))
      return new Response(
        JSON.stringify({ text: "Explain arrays in TypeScript" }),
      );
    const body = JSON.parse(init.body);
    calls.push(body);
    const answer =
      body.text.format.name === "bullet_detail"
        ? { children: ["Stable item order", "Mixed types"] }
        : body.instructions.includes("Mode code")
          ? codeAnswer
          : summary;
    return new Response(
      JSON.stringify({
        status: body.instructions.includes("Mode code") ? status : "completed",
        incomplete_details:
          status === "incomplete" ? { reason: "max_output_tokens" } : undefined,
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
        ],
      }),
    );
  });
  return {
    calls,
    transport,
    topic: new Topic(false, "fake", undefined, undefined, transport),
  };
}
it("uses selected nested item, ancestors and language context without transcription or mutating explanation", async () => {
  const { topic, calls, transport } = harness();
  const initial = await topic.ask({ ...req });
  await topic.details(initial.version!, [0]);
  transport.mockClear();
  const [one, two] = await Promise.all([
    topic.code(initial.version!, [0, 0], budget),
    topic.code(initial.version!, [0, 0], budget),
  ]);
  expect(one).toEqual(two);
  expect(one.answer?.language).toBe("TypeScript");
  expect(transport).toHaveBeenCalledOnce();
  const request = calls.at(-1);
  expect(request.store).toBe(false);
  expect(request.instructions).toContain("no meaningful code");
  const context = JSON.parse(request.input.at(-1).content);
  expect(context).toMatchObject({
    originalQuestion: "Explain arrays in TypeScript",
    selectedBullet: "Stable item order",
    ancestors: ["Ordered collections"],
  });
  expect(topic.history).toHaveLength(1);
  expect(topic.history[0].answer).toEqual(summary);
  await topic.code(initial.version!, [0, 0], budget);
  expect(transport).toHaveBeenCalledOnce();
  const fresh = await topic.ask({ ...req, id: "second" });
  expect(fresh.version).not.toBe(initial.version);
  expect(await topic.code(initial.version!, [0, 0], budget)).toEqual({});
});
it("ignores code results after reset even if the transport ignores abort", async () => {
  const { topic, transport } = harness();
  const initial = await topic.ask({ ...req });
  let resolve!: (r: Response) => void;
  transport.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  const pending = topic.code(initial.version!, [0], budget);
  topic.reset();
  resolve(
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  ...summary,
                  code: "const x = 1;",
                  language: "TypeScript",
                }),
              },
            ],
          },
        ],
      }),
    ),
  );
  expect(await pending).toEqual({});
  expect(topic.history).toEqual([]);
});
it("demo generates selected examples and explains concepts without meaningful code", async () => {
  vi.useFakeTimers();
  try {
    const topic = new Topic(true, undefined);
    const p = topic.ask({ ...req });
    await vi.runAllTimersAsync();
    const initial = await p;
    const d = topic.details(initial.version!, [0]);
    await vi.runAllTimersAsync();
    await d;
    const code = topic.code(initial.version!, [0, 0], budget);
    await vi.runAllTimersAsync();
    expect((await code).answer?.title).toBe("Stable item order");
    const nested = topic.details(initial.version!, [0, 1]);
    await vi.runAllTimersAsync();
    await nested;
    const none = topic.code(initial.version!, [0, 1, 1], budget);
    await vi.runAllTimersAsync();
    expect((await none).answer?.code).toContain("items[items.length - 1]");
    topic.reset();
  } finally {
    vi.useRealTimers();
  }
});

it("uses the main explanation topic when no bullet is selected, with a separate cached root path", async () => {
  const { topic, calls, transport } = harness();
  const initial = await topic.ask({ ...req });
  transport.mockClear();
  const root = await topic.code(initial.version!, [], budget);
  expect(root.answer?.code).toBeTruthy();
  const context = JSON.parse(calls.at(-1).input.at(-1).content);
  expect(context.selectedBullet).toBe("TypeScript arrays");
  expect(context.originalQuestion).toBe("Explain arrays in TypeScript");
  expect(context.ancestors).toEqual([]);
  await topic.code(initial.version!, [], budget);
  expect(transport).toHaveBeenCalledTimes(1);
  await topic.code(initial.version!, [0], budget);
  expect(transport).toHaveBeenCalledTimes(2);
});

it("snapshots a deep path before asynchronous ancestor resolution", async () => {
  const { topic, calls } = harness();
  const initial = await topic.ask({ ...req });
  await topic.details(initial.version!, [0]);
  await topic.details(initial.version!, [0, 0]);
  const path = [0, 0, 1];
  const pending = topic.code(initial.version!, path, budget);
  path.splice(0, path.length, 0);
  expect((await pending).answer).toBeDefined();
  const request = calls.at(-1);
  const context = JSON.parse(request.input.at(-1).content);
  expect(context).toMatchObject({
    originalQuestion: "Explain arrays in TypeScript",
    selectedItemId: initial.version + ":0.0.1",
    selectedPath: [0, 0, 1],
    selectedBullet: "Mixed types",
    ancestors: ["Ordered collections", "Stable item order"],
  });
  expect(request.max_output_tokens).toBe(12000);
  expect(request.text.format.schema.properties.code).toEqual({
    type: "string",
    maxLength: 32000,
  });
  expect(request.instructions).toContain("required HTTP setup");
});

it("preserves complete multiline markup beyond the old line and character limits", async () => {
  const code =
    'import { Component } from "@angular/core";\n' +
    '@Component({standalone: true, selector: "app-root", template: `\n' +
    "<ul>\n" +
    Array.from(
      { length: 40 },
      (_, i) => "  <li>Visible template item " + i + "</li>",
    ).join("\n") +
    "\n</ul>\n`})\nexport class App {}";
  const { topic } = harness({ ...summary, code, language: "TypeScript" });
  const initial = await topic.ask({ ...req });
  const result = await topic.code(initial.version!, [0], budget);
  expect(result.answer?.code).toBe(code);
  expect(result.answer?.fragments).toEqual([]);
});

it.each([
  [{ ...summary, code: "<ul>", incomplete: true }, "completed"],
  [{ ...summary, code: "<ul>" }, "completed"],
  [{ ...summary, code: "const a = 1;" }, "incomplete"],
])(
  "rejects incomplete code without automatic retries",
  async (answer, status) => {
    const { topic, transport } = harness(answer, status);
    const initial = await topic.ask({ ...req });
    transport.mockClear();
    const result = await topic.code(initial.version!, [0], budget);
    expect(result.answer).toBeUndefined();
    expect(result.error).toMatch(/Incomplete/);
    if (status === "incomplete")
      expect(result.error).toContain("output limit reached");
    expect(transport).toHaveBeenCalledOnce();
    expect(await topic.code(initial.version!, [0], budget)).toEqual(result);
    expect(transport).toHaveBeenCalledOnce();
  },
);

it("reuses complete selected code without viewport-dependent provider requests", async () => {
  const { topic, transport } = harness();
  const initial = await topic.ask({ ...req });
  await topic.details(initial.version!, [0]);
  const full = await topic.code(initial.version!, [0, 0], budget);
  transport.mockClear();
  expect(await topic.code(initial.version!, [0, 0], budget)).toEqual(full);
  expect(transport).not.toHaveBeenCalled();
  topic.reset();
  expect(await topic.code(initial.version!, [0, 0], budget)).toEqual({});
});
