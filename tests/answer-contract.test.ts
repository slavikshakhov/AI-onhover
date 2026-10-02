import { it, expect, vi } from "vitest";
import { answerContract } from "../electron/answer-contract";
import { Topic } from "../electron/service";
const budget = { lines: 8, columns: 40, fragments: 4 };
it("enforces Explain without code and Code with at most two fragments without viewport code limits", () => {
  const explain = answerContract("explain", budget, false);
  expect(explain.schema.properties.code.enum).toEqual([""]);
  expect(explain.schema.properties.language.enum).toEqual([""]);
  expect(explain.instructions).not.toContain("minimal code example");
  const code = answerContract("code", budget, false);
  expect(code.schema.properties.fragments.maxItems).toBe(2);
  expect(code.schema.properties.code).toEqual({
    type: "string",
    maxLength: 32000,
  });
  expect(code.instructions).toContain("no viewport line or column limit");
});
it("repairs a format violation once and prevents a second shortening call", async () => {
  let calls = 0;
  const transport = vi.fn(async (url: unknown) => {
    if (String(url).endsWith("transcriptions"))
      return new Response(JSON.stringify({ text: "Example" }));
    calls++;
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  title: "Example",
                  fragments: [],
                  language: "JavaScript",
                  incomplete: false,
                  code: "x();",
                  // A genuine mode-format violation, unrelated to source length.
                  ...(calls === 1
                    ? { fragments: ["one", "two", "three"] }
                    : {}),
                }),
              },
            ],
          },
        ],
      }),
    );
  });
  const topic = new Topic(false, "fake", undefined, undefined, transport);
  const result = await topic.ask({
    id: "one",
    mode: "code",
    budget,
    audio: new Uint8Array([1]),
    mime: "audio/webm",
  });
  expect(result.error).toBeUndefined();
  expect(result.answer?.code).toBe("x();");
  expect(result.shortened).toBe(true);
  await topic.shorten("one", budget);
  expect(calls).toBe(2);
});
it("bounds correction attempts if the provider keeps violating the contract", async () => {
  const transport = vi.fn(
    async (url: unknown) =>
      new Response(
        JSON.stringify(
          String(url).endsWith("transcriptions")
            ? { text: "Explain arrays" }
            : {
                status: "completed",
                output: [
                  {
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify({
                          title: "Arrays",
                          fragments: [],
                          language: "JS",
                          incomplete: false,
                          code: "unwanted code",
                        }),
                      },
                    ],
                  },
                ],
              },
        ),
      ),
  );
  const topic = new Topic(false, "fake", undefined, undefined, transport);
  const result = await topic.ask({
    id: "one",
    mode: "explain",
    budget,
    audio: new Uint8Array([1]),
    mime: "audio/webm",
  });
  expect(result.error).toContain("could not fit");
  expect(transport).toHaveBeenCalledTimes(3);
  expect(topic.history).toEqual([]);
});
