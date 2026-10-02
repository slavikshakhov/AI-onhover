import { expect, it, vi } from "vitest";
import { Topic } from "../electron/service";
import { conceptCodeSchema } from "../src/shared";
const budget = { lines: 8, columns: 80, fragments: 4 };
const summary = {
  title: "ARIA",
  fragments: ["Accessible names"],
  code: "",
  language: "",
  incomplete: false,
};
const request = () => ({
  id: crypto.randomUUID(),
  mode: "explain" as const,
  budget,
  audio: new Uint8Array([1]),
  mime: "audio/webm" as const,
});
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(value) }] },
      ],
    }),
  );
function harness() {
  const calls: any[] = [];
  const transport = vi.fn(async (url: unknown, init: any) => {
    if (String(url).endsWith("transcriptions"))
      return new Response(
        JSON.stringify({ text: "Subject versus BehaviorSubject" }),
      );
    const body = JSON.parse(init.body);
    calls.push(body);
    return response(
      body.text.format.name === "bullet_detail"
        ? { children: ["aria-label"] }
        : body.instructions.includes("Mode code")
          ? {
              ...summary,
              code: '<button aria-label="Close dialog">×</button>',
              language: "HTML",
            }
          : summary,
    );
  });
  return {
    topic: new Topic(false, "fake", undefined, undefined, transport),
    transport,
    calls,
  };
}
it("threads context and explicit-question precedence through answers, nested details and practical markup; reset preserves defaults", async () => {
  const { topic, calls } = harness();
  topic.setSessionContext("Angular / TypeScript; Java / Spring Boot");
  const initial = await topic.ask(request());
  await topic.details(initial.version!, [0]);
  const code = await topic.code(initial.version!, [0, 0], budget);
  expect(code.answer?.code).toContain('<button aria-label="Close dialog">');
  for (const call of calls) {
    expect(call.instructions).toContain("Angular / TypeScript");
    expect(call.instructions).toContain(
      "never an override of explicit questions or visible screenshot requirements",
    );
  }
  expect(calls[0].input.at(-1).content).toBe("Subject versus BehaviorSubject");
  expect(JSON.parse(calls.at(-1).input.at(-1).content).selectedBullet).toBe(
    "aria-label",
  );
  topic.reset();
  await topic.ask(request());
  expect(calls.at(-1).instructions).toContain("Angular / TypeScript");
  topic.setSessionContext("React / Node.js");
  expect(await topic.code(initial.version!, [0, 0], budget)).toEqual({});
  await topic.ask(request());
  expect(calls.at(-1).instructions).toContain("React / Node.js");
  expect(calls.at(-1).instructions).not.toContain("Angular / TypeScript");
  topic.setSessionContext("");
  await topic.ask(request());
  expect(calls.at(-1).instructions).toContain('Session context: ""');
});
it("discards old pending answers and examples even when transport ignores abort", async () => {
  const { topic, transport } = harness();
  const initial = await topic.ask(request());
  let resolve!: (r: Response) => void;
  transport.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = topic.code(initial.version!, [0], budget);
  topic.setSessionContext("React");
  resolve(response({ ...summary, code: "const x = 1;" }));
  expect(await pending).toEqual({});
  transport.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const asking = topic.ask(request());
  topic.setSessionContext("Angular");
  resolve(new Response(JSON.stringify({ text: "Old question" })));
  expect((await asking).answer).toBeUndefined();
  expect(topic.history).toEqual([]);
});
it("accepts useful native void-element markup and practical non-code examples", () => {
  expect(
    conceptCodeSchema.parse({ ...summary, code: '<input aria-label="Search">' })
      .code,
  ).toContain("input");
  expect(
    conceptCodeSchema.parse({
      ...summary,
      fragments: [
        "Use a keyboard to verify focus order.",
        "Ask a screen reader user to try the form.",
      ],
    }).fragments,
  ).toHaveLength(2);
});
