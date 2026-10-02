import { it, expect, vi } from "vitest";
import { Topic } from "../electron/service";
const answer = {
  title: "Arrays",
  fragments: ["Ordered collections"],
  code: "",
  language: "",
  incomplete: false,
};
const budget = { lines: 8, columns: 40, fragments: 4 };
it("uses topic, original question, summary and selected bullet without adding history; invalidates cache on answer replacement", async () => {
  const requests: any[] = [];
  const fetcher = vi.fn(async (url: unknown, init: any) => {
    if (String(url).endsWith("transcriptions"))
      return new Response(JSON.stringify({ text: "Explain arrays" }));
    const body = JSON.parse(init.body);
    requests.push(body);
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(
                  body.text.format.name === "bullet_detail"
                    ? {
                        children: [
                          "Stable item order",
                          "Indexed access",
                          "Mixed types",
                        ],
                      }
                    : answer,
                ),
              },
            ],
          },
        ],
      }),
    );
  });
  const topic = new Topic(false, "fake", undefined, undefined, fetcher);
  const initial = await topic.ask({
    id: "a",
    mode: "explain",
    budget,
    audio: new Uint8Array([1]),
    mime: "audio/webm",
  });
  const first = await topic.details(initial.version!, [0]);
  expect(first.children?.join(" ")).toContain("order");
  await topic.details(initial.version!, [0]);
  expect(requests).toHaveLength(2);
  const detail = requests[1];
  expect(detail.store).toBe(false);
  expect(JSON.parse(detail.input)).toMatchObject({
    originalQuestion: "Explain arrays",
    summary: answer,
    selectedBullet: "Ordered collections",
  });
  expect(JSON.parse(detail.input).topic).toHaveLength(1);
  expect(topic.history).toHaveLength(1);
  const child = await topic.details(initial.version!, [0, 0]);
  expect(child.children).toHaveLength(3);
  expect(JSON.parse(requests[2].input)).toMatchObject({
    selectedBullet: "Stable item order",
    ancestors: ["Ordered collections"],
  });
  await topic.details(initial.version!, [0, 0]);
  expect(requests).toHaveLength(3);
  expect(requests[1].text.format.schema.properties.children.maxItems).toBe(5);
  expect(requests[1].text.format.schema.properties.sentences).toBeUndefined();
  const shorter = await topic.shorten("a", budget);
  expect(shorter.version).not.toBe(initial.version);
  expect(await topic.details(initial.version!, [0])).toEqual({});
  await topic.details(shorter.version!, [0]);
  expect(requests).toHaveLength(5);
  topic.reset();
  expect(await topic.details(shorter.version!, [0])).toEqual({});
});
