import { withReviewFixture } from "./review-fixture";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Topic } from "../electron/service";
import { screenshotAnswerContract } from "../electron/answer-contract";
import { CodePanel } from "../src/AnswerPanel";
import { screenshotAnswerSchema, type Answer } from "../src/shared";

const budget = { lines: 1, columns: 20, fragments: 1 };
const outputs: NonNullable<Answer["outputs"]> = [
  { label: "first", kind: "value", value: "0", reason: "initial counter" },
  {
    label: "second",
    kind: "value",
    value: '"ready"',
    reason: "assigned string",
  },
  { label: "third", kind: "value", value: "null", reason: "explicit null" },
  {
    label: "fourth",
    kind: "value",
    value: "false",
    reason: "comparison fails",
  },
  {
    label: "fifth",
    kind: "value",
    value: "undefined",
    reason: "no return value",
  },
];
const exceptions: NonNullable<Answer["outputs"]> = [
  {
    label: "Output 1",
    kind: "value",
    value: "7",
    reason: "runs before the failure",
  },
  {
    label: "Output 2",
    kind: "exception",
    value: "ReferenceError",
    reason: "argument access throws before printing",
  },
  {
    label: "Output 3",
    kind: "not-reached",
    value: "",
    reason: "uncaught ReferenceError stops execution",
  },
];
const makeAnswer = (items: typeof outputs): Answer => ({
  title: "Execution results",
  intent: "output",
  approach: "",
  complexity: "",
  fragments: [],
  code: "",
  language: "",
  incomplete: false,
  outputs: items,
});
it.each([{ items: outputs }, { items: exceptions }])(
  "retains every structured result through generation and shortening",
  async ({ items }) => {
    const answer = makeAnswer(items);
    const requests: any[] = [];
    const transport = vi.fn(async (url: unknown, init: any) => {
      if (String(url).endsWith("transcriptions"))
        return new Response(
          JSON.stringify({ text: "What does each output print?" }),
        );
      requests.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              content: [{ type: "output_text", text: JSON.stringify(answer) }],
            },
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
    topic.setImage("data:image/png;base64,TEST");
    const result = await topic.ask({
      id: "outputs",
      mode: "code",
      budget,
      audio: new Uint8Array([1]),
      mime: "audio/webm",
    });
    expect(result.answer).toEqual(answer);
    expect((await topic.shorten("outputs", budget)).answer).toEqual(answer);
    expect(requests).toHaveLength(1);
    expect(requests[0].text.format.schema.required).toContain("outputs");
    expect(
      requests[0].text.format.schema.properties.outputs.maxItems,
    ).toBeUndefined();
    expect(requests[0].instructions).not.toContain("minimal code example");
    expect(requests[0].instructions).toContain("EVERY requested output");
    expect(requests[0].instructions).toContain(
      "caught exceptions do not necessarily stop",
    );
  },
);
it("renders five exact values as ordered separate bullets without code or an incomplete label", () => {
  const html = renderToStaticMarkup(
    <CodePanel
      screenshot
      result={{ answer: makeAnswer(outputs) }}
      onReturn={() => {}}
    />,
  );
  expect(html.match(/<li>/g)).toHaveLength(5);
  expect(html).toContain("first: 0 — initial counter");
  expect(html).toContain("second: &quot;ready&quot; — assigned string");
  expect(html.indexOf("first:")).toBeLessThan(html.indexOf("fifth:"));
  expect(html).not.toContain("<pre>");
  expect(html).not.toContain("Incomplete snippet");
  expect(html).toContain("screenshot-content");
});
it("renders exceptions separately from printed values and identifies blocked later outputs", () => {
  const html = renderToStaticMarkup(
    <CodePanel
      screenshot
      result={{ answer: makeAnswer(exceptions) }}
      onReturn={() => {}}
    />,
  );
  expect(html.match(/<li>/g)).toHaveLength(3);
  expect(html).toContain("Output 1: 7 — runs before the failure");
  expect(html).toContain(
    "Output 2: throws ReferenceError — argument access throws before printing",
  );
  expect(html).toContain(
    "Output 3: not reached — uncaught ReferenceError stops execution",
  );
  expect(html).not.toContain("Incomplete snippet");
});
it("accepts a caught exception followed by another value without classifying the later output as blocked", () => {
  const html = renderToStaticMarkup(
    <CodePanel
      screenshot
      result={{
        answer: makeAnswer([
          {
            label: "catch",
            kind: "value",
            value: '"handled"',
            reason: "catch prints after handling the exception",
          },
          {
            label: "after",
            kind: "value",
            value: "9",
            reason: "execution continues after catch",
          },
        ]),
      }}
      onReturn={() => {}}
    />,
  );
  expect(html).toContain("after: 9 — execution continues after catch");
  expect(html).not.toContain("not reached");
});
it("requires structured results and valid outcome kinds for screenshot responses", () => {
  const { outputs: ignored, ...missing } = makeAnswer(outputs);
  expect(screenshotAnswerSchema.safeParse(missing).success).toBe(false);
  expect(
    screenshotAnswerSchema.safeParse(
      makeAnswer([{ ...outputs[0], kind: "printed-exception" as any }]),
    ).success,
  ).toBe(false);
  const contract = screenshotAnswerContract(budget);
  expect(contract.instructions).toContain("if absent use Output 1, Output 2");
  expect(contract.instructions).toContain("missing or illegible");
});

it("reports genuinely missing code without inventing a value or a replacement snippet", () => {
  const answer = makeAnswer([
    {
      label: "result",
      kind: "unknown",
      value: "",
      reason: "the called function body is cropped out",
    },
  ]);
  answer.incomplete = true;
  const html = renderToStaticMarkup(
    <CodePanel screenshot result={{ answer }} onReturn={() => {}} />,
  );
  expect(html).toContain(
    "result: cannot determine — the called function body is cropped out",
  );
  expect(html).not.toContain("<pre>");
});
it("still supports explicitly requested code alongside the output results", () => {
  const answer = makeAnswer(outputs.slice(0, 1));
  answer.code = "console.log(0);";
  answer.language = "JavaScript";
  const html = renderToStaticMarkup(
    <CodePanel screenshot result={{ answer }} onReturn={() => {}} />,
  );
  expect(html).toContain("<code>console.log(0);</code>");
  expect(html.indexOf("first: 0")).toBeLessThan(html.indexOf("<code>"));
  expect(screenshotAnswerContract(budget).instructions).toContain(
    "unless the user explicitly requests code",
  );
});
