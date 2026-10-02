import { afterEach, expect, it, vi } from "vitest";
import { DetailHover } from "../src/detail-hover";
import { Details, parseDetails, type DetailSource } from "../electron/details";
afterEach(() => vi.useRealTimers());
const source: DetailSource = {
  version: "one",
  question: "Why?",
  answer: {
    title: "Topic",
    fragments: ["Qualified point"],
    code: "",
    language: "",
    incomplete: false,
  },
  history: [],
};
it("requires 600ms of hover and cancels flyovers", () => {
  vi.useFakeTimers();
  const change = vi.fn();
  const h = new DetailHover(change);
  h.enter(0);
  vi.advanceTimersByTime(599);
  expect(change).not.toHaveBeenCalled();
  h.leave();
  vi.advanceTimersByTime(1);
  expect(change).not.toHaveBeenCalled();
  h.enter(0);
  vi.advanceTimersByTime(600);
  expect(change).toHaveBeenLastCalledWith(0);
  h.dispose();
});
it("keeps the combined area open, collapses after 300ms and only selects one item", () => {
  vi.useFakeTimers();
  const change = vi.fn();
  const h = new DetailHover(change);
  h.enter(0);
  vi.advanceTimersByTime(600);
  h.leave();
  vi.advanceTimersByTime(299);
  expect(h.active).toBe(0);
  h.stay();
  vi.advanceTimersByTime(500);
  expect(h.active).toBe(0);
  h.enter(1);
  vi.advanceTimersByTime(600);
  expect(h.active).toBe(1);
  h.leave();
  vi.advanceTimersByTime(300);
  expect(h.active).toBeUndefined();
  h.dispose();
});
it("shares pending requests and caches successful and failed details without retries", async () => {
  const cache = new Details();
  const generate = vi.fn(async () => [
    "Context-dependent behavior",
    "Relevant exceptions",
  ]);
  const one = cache.get(source, [0], generate);
  expect(cache.get(source, [0], generate)).toBe(one);
  await one;
  expect(
    (await cache.get(source, [0], generate)).children?.join(" "),
  ).toContain("Context-dependent");
  expect(generate).toHaveBeenCalledOnce();
  const fail = vi.fn(async () => {
    throw new Error("offline");
  });
  await cache.get(source, [1], fail);
  await cache.get(source, [1], fail);
  expect(fail).toHaveBeenCalledOnce();
  cache.clear();
});
it("aborts and ignores stale details after reset or answer change, even if transport ignores cancellation", async () => {
  const cache = new Details();
  let resolve!: (s: string[]) => void;
  let signal!: AbortSignal;
  const pending = cache.get(source, [0], (s) => {
    signal = s;
    return new Promise((r) => (resolve = r));
  });
  cache.clear();
  expect(signal.aborted).toBe(true);
  resolve(["Old"]);
  expect(await pending).toEqual({});
  const fresh = await cache.get(
    { ...source, version: "two" },
    [0],
    async () => ["New"],
  );
  expect(fresh.children?.join(" ")).toBe("New");
  const newer = await cache.get(
    { ...source, version: "three" },
    [0],
    async () => ["Newest"],
  );
  expect(newer.children?.join(" ")).toBe("Newest");
});
it("accepts structured child concepts and rejects the old paragraph format", () => {
  expect(
    parseDetails(
      JSON.stringify({
        children: [
          "Relevant constraints",
          "Qualified result",
          "Useful technique",
        ],
      }),
    ),
  ).toHaveLength(3);
  expect(() =>
    parseDetails(JSON.stringify({ sentences: ["Old paragraph."] })),
  ).toThrow();
  expect(() =>
    parseDetails(JSON.stringify({ children: ["One\nTwo"] })),
  ).toThrow();
  expect(() =>
    parseDetails(JSON.stringify({ children: Array(6).fill("Concept") })),
  ).toThrow();
  expect(() =>
    parseDetails(
      JSON.stringify({ children: [Array(11).fill("word").join(" ")] }),
    ),
  ).toThrow();
});

it("rejects multiple sentences packed into one child", () => {
  expect(() =>
    parseDetails(
      JSON.stringify({ children: ["First sentence. Second sentence."] }),
    ),
  ).toThrow();
});

it("does not activate a bullet moved away by layout and collapses the previous bullet after 300ms", () => {
  vi.useFakeTimers();
  const change = vi.fn();
  let valid = true;
  const hover = new DetailHover(change, () => valid);
  hover.enter(0);
  vi.advanceTimersByTime(600);
  hover.leave();
  hover.enter(1);
  vi.advanceTimersByTime(300);
  expect(hover.active).toBeUndefined();
  valid = false;
  vi.advanceTimersByTime(300);
  expect(hover.active).toBeUndefined();
  hover.dispose();
});

it("partitions detail caches by session context even for the same answer version", async () => {
  const cache = new Details();
  const react = { ...source, sessionContext: "Front end: React" };
  const angular = { ...source, sessionContext: "Front end: Angular" };
  const generateReact = vi.fn(async () => ["Read authentication state"]);
  const generateAngular = vi.fn(async () => ["Configure a route guard"]);
  await cache.get(react, [0], generateReact);
  expect(
    (await cache.lookup(source.version, [0], react.sessionContext))?.children,
  ).toEqual(["Read authentication state"]);
  expect(
    cache.lookup(source.version, [0], angular.sessionContext),
  ).toBeUndefined();
  expect((await cache.get(angular, [0], generateAngular)).children).toEqual([
    "Configure a route guard",
  ]);
  expect(
    cache.lookup(source.version, [0], react.sessionContext),
  ).toBeUndefined();
  expect(generateAngular).toHaveBeenCalledOnce();
  cache.clear();
});
