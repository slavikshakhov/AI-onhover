import { expect, it } from "vitest";
import { codePages } from "../src/code-pages";
const fit = (count: number) => (text: string) =>
  text.split("\n").length <= count;
it("uses one page first, preserves every source line on two, and never has a third", () => {
  const source =
    "function a() {\n  work();\n}\n\nfunction b() {\n  other();\n}";
  expect(codePages(source, fit(7))).toEqual([source]);
  const pages = codePages(source, fit(4))!;
  expect(pages).toHaveLength(2);
  expect(pages.join("\n")).toBe(source);
  expect(pages[0]).toBe("function a() {\n  work();\n}\n");
  expect(codePages(source, fit(3))).toBeUndefined();
});
it("accounts for wrapped lines, terminal newlines and lines too tall for a page", () => {
  const fits = (s: string) =>
    s
      .split("\n")
      .reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 5)), 0) <= 3;
  const code = "1234567890\nx\ny\n";
  const pages = codePages(code, fits)!;
  expect(pages).toHaveLength(2);
  expect(pages.join("\n")).toBe(code);
  expect(pages.every(fits)).toBe(true);
  expect(codePages("x".repeat(40), fits)).toBeUndefined();
});
