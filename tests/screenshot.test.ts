import { withReviewFixture } from "./review-fixture";
import { it, expect, vi } from "vitest";
import { Topic } from "../electron/service";
import { cropRegion } from "../electron/region";
import { HoverGate } from "../src/hover";
const budget = { lines: 5, columns: 40, fragments: 2 };
const req = (id: string) => ({
  id,
  mode: "code" as const,
  budget,
  audio: new Uint8Array([1]),
  mime: "audio/webm" as const,
});
const answer = {
  title: "x = 5",
  intent: "output" as const,
  approach: "",
  complexity: "",
  fragments: ["Starts at 2", "Adds 3"],
  code: "",
  language: "",
  incomplete: false,
  outputs: [],
};
function transport() {
  const requests: any[] = [];
  const fetcher = vi.fn(async (url: unknown, init: any) => {
    if (String(url).endsWith("transcriptions"))
      return new Response(
        JSON.stringify({ text: "What is the final value of x?" }),
      );
    const body = JSON.parse(init.body);
    requests.push(body);
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
        ],
      }),
    );
  });
  return { fetcher, requests };
}
it("attaching an image makes no request and keeps screenshot history separate", async () => {
  const { fetcher, requests } = transport();
  const explanation = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(fetcher),
  );
  const screenshot = new Topic(
    false,
    "fake",
    undefined,
    undefined,
    withReviewFixture(fetcher),
  );
  screenshot.setImage("data:image/png;base64,DEMO");
  expect(fetcher).not.toHaveBeenCalled();
  await explanation.ask({ ...req("explain"), mode: "explain" });
  await screenshot.ask(req("shot1"));
  await screenshot.ask(req("shot2"));
  expect(explanation.history).toHaveLength(1);
  expect(screenshot.history).toHaveLength(2);
  const first = requests[1];
  expect(first.store).toBe(false);
  expect(first.input).toHaveLength(1);
  expect(first.input[0].content[1]).toMatchObject({
    type: "input_image",
    image_url: "data:image/png;base64,DEMO",
  });
  expect(first.instructions).toContain("missing or illegible");
  expect(requests[2].input).toHaveLength(3);
  screenshot.setImage("data:image/png;base64,REPLACEMENT");
  expect(screenshot.history).toEqual([]);
  expect(explanation.history).toHaveLength(1);
  screenshot.reset();
  expect(screenshot.history).toEqual([]);
});
it("replacement invalidates an unfinished screenshot answer", async () => {
  vi.useFakeTimers();
  try {
    const topic = new Topic(true, undefined);
    topic.setImage("data:image/png;base64,OLD");
    const pending = topic.ask(req("old"));
    topic.setImage("data:image/png;base64,NEW");
    await vi.runAllTimersAsync();
    expect((await pending).answer).toBeUndefined();
    expect(topic.history).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
it("navigation consumes an entire Explain hover and re-entry alone can record", () => {
  vi.useFakeTimers();
  try {
    let screenshot = true;
    const record = vi.fn(),
      navigate = vi.fn(() => {
        screenshot = false;
      });
    const gate = new HoverGate(
      350,
      () => (screenshot ? navigate() : record()),
      vi.fn(),
    );
    gate.enter();
    vi.advanceTimersByTime(350);
    expect(navigate).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    gate.enter();
    expect(record).not.toHaveBeenCalled();
    gate.leave();
    gate.enter();
    vi.advanceTimersByTime(350);
    expect(record).toHaveBeenCalledOnce();
    gate.cancel();
  } finally {
    vi.useRealTimers();
  }
});
it("maps CSS regions to image pixels and clamps to the display", () => {
  expect(
    cropRegion(
      { x: 10, y: 20, width: 50, height: 30 },
      { width: 100, height: 100 },
      { width: 200, height: 200 },
    ),
  ).toEqual({ x: 20, y: 40, width: 100, height: 60 });
  expect(
    cropRegion(
      { x: 90, y: 90, width: 30, height: 30 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ),
  ).toEqual({ x: 90, y: 90, width: 10, height: 10 });
  expect(() =>
    cropRegion(
      { x: 0, y: 0, width: 2, height: 2 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    ),
  ).toThrow();
});

it("rounds crop edges outward so fractional display scaling keeps the full selected region", () => {
  expect(
    cropRegion(
      { x: 0.3, y: 0.3, width: 8, height: 8 },
      { width: 100, height: 100 },
      { width: 150, height: 150 },
    ),
  ).toEqual({ x: 0, y: 0, width: 13, height: 13 });
});
