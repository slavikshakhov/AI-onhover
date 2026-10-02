import { afterEach, describe, it, expect, vi } from "vitest";
import { HoverGate } from "../src/hover";
import {
  budgetFor,
  overflows,
  answerSchema,
  validModeAnswer,
} from "../src/shared";
import { Topic } from "../electron/service";
afterEach(() => vi.useRealTimers());
describe("deliberate hover", () => {
  it("ignores flyovers, activates at 350ms and submits exactly once on leave", () => {
    vi.useFakeTimers();
    const start = vi.fn(),
      stop = vi.fn();
    const g = new HoverGate(350, start, stop);
    g.enter();
    vi.advanceTimersByTime(349);
    g.leave();
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    g.enter();
    vi.advanceTimersByTime(350);
    expect(start).toHaveBeenCalledTimes(1);
    g.leave();
    g.leave();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("requires exit after cancellation and disabled entry", () => {
    vi.useFakeTimers();
    const start = vi.fn();
    const g = new HoverGate(350, start, vi.fn());
    g.enter();
    g.cancel();
    g.enter();
    vi.advanceTimersByTime(500);
    expect(start).not.toHaveBeenCalled();
    g.leave();
    g.enter(false);
    g.enter(true);
    vi.advanceTimersByTime(500);
    expect(start).not.toHaveBeenCalled();
    g.leave();
    g.enter();
    vi.advanceTimersByTime(350);
    expect(start).toHaveBeenCalledOnce();
  });
  it("resets only after one second and requires exit", () => {
    vi.useFakeTimers();
    const reset = vi.fn();
    const g = new HoverGate(1000, reset, vi.fn());
    g.enter();
    vi.advanceTimersByTime(999);
    expect(reset).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    g.enter();
    vi.advanceTimersByTime(2000);
    expect(reset).toHaveBeenCalledOnce();
  });
});
const budget = budgetFor(400, 250);
const answer = {
  title: "Arrays",
  fragments: ["Ordered collection"],
  code: "",
  language: "",
  incomplete: false,
};
function transport() {
  const calls: any[] = [];
  const f = vi.fn(async (url: any, init: any) => {
    if (String(url).endsWith("transcriptions"))
      return {
        ok: true,
        json: async () => ({ text: "Show an example" }),
      } as Response;
    const body = JSON.parse(init.body);
    calls.push(body);
    const result = body.instructions.includes("Mode code")
      ? { ...answer, code: "const a = [1];", language: "JavaScript" }
      : answer;
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(result) }] },
        ],
      }),
    } as Response;
  });
  return { calls, f };
}
const req = (id = "a", mode: "explain" | "code" = "explain") => ({
  id,
  mode,
  budget,
  audio: new Uint8Array([1, 2]),
  mime: "audio/webm" as const,
});
describe("topic and API contracts", () => {
  it("keeps context across modes, bounds history, and disables provider storage", async () => {
    const { calls, f } = transport();
    const t = new Topic(false, "fake", undefined, undefined, f);
    await t.ask(req());
    await t.ask(req("b", "code"));
    expect(calls[1].input[1].content).toContain("Arrays");
    expect(calls[1].store).toBe(false);
    for (let i = 0; i < 8; i++) await t.ask(req(String(i)));
    expect(t.history).toHaveLength(6);
    t.reset();
    expect(t.history).toHaveLength(0);
  });
  it("invalidates pending work on reset even if transport ignores abort", async () => {
    let resolve!: (v: any) => void;
    const f = vi.fn(() => new Promise<any>((r) => (resolve = r)));
    const t = new Topic(false, "fake", undefined, undefined, f);
    const pending = t.ask({ ...req(), audio: undefined });
    await pending;
    const real = t.ask(req());
    t.reset();
    resolve({ ok: true, json: async () => ({ text: "Late transcription" }) });
    await real;
    expect(f).toHaveBeenCalledTimes(1);
    expect(t.history).toEqual([]);
  });
  it("cancels demo work and prevents stale answer", async () => {
    vi.useFakeTimers();
    const t = new Topic(true, undefined);
    const pending = t.ask(req());
    t.reset();
    await vi.runAllTimersAsync();
    expect((await pending).answer).toBeUndefined();
    expect(t.history).toEqual([]);
  });
  it("allows at most one shortening request", async () => {
    const { f, calls } = transport();
    const t = new Topic(false, "fake", undefined, undefined, f);
    await t.ask(req());
    await t.shorten("a", budget);
    await t.shorten("a", budget);
    expect(calls).toHaveLength(2);
  });
  it("returns safe auth and invalid-response errors", async () => {
    const auth = new Topic(
      false,
      "fake",
      undefined,
      undefined,
      vi.fn(
        async () =>
          ({ ok: false, status: 401, json: async () => ({}) }) as Response,
      ),
    );
    expect((await auth.ask(req())).error).toContain("API key rejected");
    const { f } = transport();
    f.mockImplementationOnce(
      async () =>
        ({ ok: true, json: async () => ({ text: "Question" }) }) as Response,
    ).mockImplementationOnce(
      async () =>
        ({
          ok: true,
          json: async () => ({ status: "completed", output: [] }),
        }) as Response,
    );
    expect(
      (await new Topic(false, "fake", undefined, undefined, f).ask(req()))
        .error,
    ).toContain("Invalid AI response");
  });
});
describe("answer sizing", () => {
  it("adapts bounded budgets and detects both overflow axes", () => {
    expect(budgetFor(200, 110).lines).toBe(1);
    expect(budgetFor(2000, 2000).lines).toBe(8);
    expect(
      overflows({
        scrollHeight: 102,
        clientHeight: 100,
        scrollWidth: 50,
        clientWidth: 50,
      }),
    ).toBe(true);
    expect(
      overflows({
        scrollHeight: 100,
        clientHeight: 100,
        scrollWidth: 52,
        clientWidth: 50,
      }),
    ).toBe(true);
  });
  it("rejects malformed answers and overlong code rather than truncating", () => {
    expect(
      answerSchema.safeParse({ ...answer, incomplete: "yes" }).success,
    ).toBe(false);
    expect(
      validModeAnswer(
        { ...answer, code: Array(10).fill("line").join("\n") },
        "code",
      ),
    ).toBe(false);
  });
});
