import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodePanel } from "../src/AnswerPanel";
import { screenshotAnswerSchema } from "../src/shared";

it.each([
  "function f() { return 1; }",
  `function f() {\n${"  doRequiredWork();\n".repeat(30)}  return result;\n}`,
])(
  "retains complete source for measurement without headings, notes or omissions",
  (code) => {
    const answer = {
      intent: "implement" as const,
      title: "",
      fragments: [],
      code,
      language: "",
      incomplete: false,
      outputs: [],
      approach: "",
      complexity: "",
    };
    expect(screenshotAnswerSchema.safeParse(answer).success).toBe(true);
    const html = renderToStaticMarkup(
      <CodePanel
        screenshot
        result={{
          answer: {
            ...answer,
            title: "Unwanted heading",
            fragments: ["Unwanted explanation"],
            approach: "Unwanted approach",
          },
        }}
        onReturn={() => {}}
      />,
    );
    expect(html).not.toMatch(/<h1|<nav|Unwanted|ellipsis/);
    expect(html).toContain('class="panel-controls"');
    expect(html).toContain('class="code-measure"');
    expect(html).toContain(code);
  },
);

it("normalizes completed solution metadata without changing any source code", () => {
  const code = "function f() { return 7; }";
  const answer = screenshotAnswerSchema.parse({
    intent: "implement",
    title: "Unwanted heading",
    code,
    language: "JavaScript",
    incomplete: false,
    fragments: ["Unwanted notes"],
    outputs: [],
    approach: "Unwanted approach",
    complexity: "Unwanted complexity",
  });
  expect(answer).toMatchObject({
    code,
    title: "",
    fragments: [],
    outputs: [],
    approach: "",
    complexity: "",
    language: "",
  });
});

it("renders complete concept templates as escaped multiline text, without explanation bullets", () => {
  const code =
    "const template = `\n<ul>\n  <li>{{ item.name }}</li>\n</ul>\n`;";
  const html = renderToStaticMarkup(
    <CodePanel
      result={{
        answer: {
          title: "Template",
          code,
          language: "TypeScript",
          incomplete: false,
          fragments: ["Unwanted generic notes"],
        },
      }}
      onReturn={() => {}}
    />,
  );
  expect(html).toContain(
    "&lt;ul&gt;\n  &lt;li&gt;{{ item.name }}&lt;/li&gt;\n&lt;/ul&gt;",
  );
  expect(html).not.toMatch(/<ul>|Incomplete snippet|Unwanted generic notes/);
});

it("does not present an incomplete concept fragment as successful code", () => {
  const html = renderToStaticMarkup(
    <CodePanel
      result={{
        answer: {
          title: "Pagination",
          code: "<ul>",
          language: "HTML",
          incomplete: true,
          fragments: ["Unwanted notes"],
        },
      }}
      onReturn={() => {}}
    />,
  );
  expect(html).toContain("No partial solution was accepted");
  expect(html).not.toMatch(/<code>|Incomplete snippet|Unwanted notes/);
});
