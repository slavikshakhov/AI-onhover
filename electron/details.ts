import { z } from "zod";
import type { Answer, DetailResult } from "../src/shared.js";
export type DetailSource = {
  version: string;
  question: string;
  answer: Answer;
  history: unknown;
  sessionContext?: string;
};
const childrenSchema = z
  .object({
    children: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(80)
          .refine(
            (s) =>
              !/[\r\n]/.test(s) &&
              !/^[•*-]\s/.test(s) &&
              s.split(/\s+/).length <= 10 &&
              [
                ...new Intl.Segmenter("en", {
                  granularity: "sentence",
                }).segment(s),
              ].length <= 1,
          ),
      )
      .min(1)
      .max(5),
  })
  .strict();
export function parseDetails(raw: string): string[] {
  const { children } = childrenSchema.parse(JSON.parse(raw));
  if (
    children.join(" ").split(/\s+/).length > 35 ||
    new Set(children).size !== children.length
  )
    throw new Error("Invalid child concepts");
  return children;
}
export class Details {
  private cache = new Map<string, Promise<DetailResult>>();
  private controller = new AbortController();
  private version = "";
  private sessionContext = "";
  lookup(version: string, path: number[], sessionContext = "") {
    return version === this.version && sessionContext === this.sessionContext
      ? this.cache.get(JSON.stringify([sessionContext, path]))
      : undefined;
  }
  clear() {
    this.controller.abort();
    this.controller = new AbortController();
    this.cache.clear();
    this.version = "";
    this.sessionContext = "";
  }
  get(
    source: DetailSource,
    path: number[],
    generate: (signal: AbortSignal) => Promise<string[]>,
  ): Promise<DetailResult> {
    const sessionContext = source.sessionContext ?? "";
    if (
      source.version !== this.version ||
      sessionContext !== this.sessionContext
    ) {
      this.clear();
      this.version = source.version;
      this.sessionContext = sessionContext;
    }
    const key = JSON.stringify([sessionContext, path]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (this.cache.size >= 128)
      return Promise.resolve({
        error: "Topic detail limit reached. Start a new topic.",
      });
    const parent = this.controller;
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 20000);
    const pending = (async () => {
      try {
        const children = await generate(controller.signal);
        if (controller.signal.aborted || parent !== this.controller) return {};
        return { children };
      } catch {
        return parent !== this.controller
          ? {}
          : { error: "Details unavailable. Try again with a new answer." };
      } finally {
        clearTimeout(timer);
        parent.signal.removeEventListener("abort", abort);
      }
    })();
    this.cache.set(key, pending);
    return pending;
  }
}
