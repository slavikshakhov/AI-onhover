import { z } from "zod";
export type Mode = "explain" | "code";
export const outputSchema = z
  .object({
    label: z.string().min(1).max(80),
    kind: z.enum(["value", "exception", "not-reached", "unknown"]),
    value: z.string().max(500),
    reason: z.string().max(240),
  })
  .strict();
export const screenshotIntentSchema = z.enum([
  "implement",
  "output",
  "explain",
  "debug",
  "clarify",
]);
export const answerSchema = z
  .object({
    title: z.string().min(1).max(80),
    fragments: z.array(z.string().max(120)).max(4),
    code: z.string().max(32000),
    language: z.string().max(24),
    incomplete: z.boolean(),
    outputs: z.array(outputSchema).optional(),
    intent: screenshotIntentSchema.optional(),
    approach: z.string().max(240).optional(),
    complexity: z.string().max(240).optional(),
  })
  .strict();
export const conceptCodeSchema = answerSchema
  .extend({
    code: z.string().max(32000),
    incomplete: z.literal(false),
  })
  .refine(
    (a) =>
      !/^<(?!area\b|base\b|br\b|col\b|embed\b|hr\b|img\b|input\b|link\b|meta\b|param\b|source\b|track\b|wbr\b)([a-z][\w-]*)(?:\s[^>]*)?>$/i.test(
        a.code.trim(),
      ),
    {
      message: "A lone opening tag is not a complete example",
    },
  )
  .refine((a) => !!a.code.trim() || a.fragments.length > 0, {
    message: "Provide code or practical usage examples",
  })
  .transform((a) =>
    a.code.trim() ? { ...a, fragments: [] } : { ...a, code: "", language: "" },
  );

export const screenshotAnswerSchema = answerSchema
  .extend({
    title: z.string().max(80),
    intent: screenshotIntentSchema,
    approach: z.string().max(240),
    complexity: z.string().max(240),
    code: z.string().max(32000),
    outputs: z.array(outputSchema),
  })
  .superRefine((answer, ctx) => {
    if (
      (answer.intent === "implement" || answer.intent === "debug") &&
      !answer.incomplete &&
      !answer.code.trim()
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "A complete implementation or fix requires solution code",
      });
    if (
      answer.intent === "clarify" &&
      (answer.code !== "" ||
        answer.outputs.length !== 0 ||
        answer.fragments.length !== 1)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fragments"],
        message:
          "Clarification must contain one short question without invented code or outputs",
      });
    if (answer.intent === "explain" && answer.outputs.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputs"],
        message: "Explanation uses concept fragments",
      });
  })
  .transform((answer) => {
    // Completed challenge answers are code-only even if the provider adds metadata.
    if (
      (answer.intent === "implement" || answer.intent === "debug") &&
      !answer.incomplete
    )
      return {
        ...answer,
        title: "",
        language: "",
        fragments: [],
        outputs: [],
        approach: "",
        complexity: "",
      };
    return answer;
  });
export function outputText(output: z.infer<typeof outputSchema>) {
  const value =
    output.kind === "exception"
      ? `throws ${output.value}`
      : output.kind === "not-reached"
        ? "not reached"
        : output.kind === "unknown"
          ? "cannot determine"
          : output.value;
  return `${output.label}: ${value}${output.reason ? ` — ${output.reason}` : ""}`;
}
export type Answer = z.infer<typeof answerSchema>;
export const budgetSchema = z
  .object({
    lines: z.number().int().min(1).max(8),
    columns: z.number().int().min(16).max(90),
    fragments: z.number().int().min(1).max(4),
  })
  .strict();
export type Budget = z.infer<typeof budgetSchema>;
export const requestSchema = z
  .object({
    id: z.string().uuid(),
    mode: z.enum(["explain", "code"]),
    budget: budgetSchema,
    audio: z.instanceof(Uint8Array).optional(),
    mime: z.enum(["audio/webm", "audio/ogg", "audio/mp4"]).optional(),
  })
  .strict();
export type Request = z.infer<typeof requestSchema>;
export type DetailResult = { children?: string[]; error?: string };
export type Result = {
  version?: string;
  id: string;
  answer?: Answer;
  error?: string;
  empty?: boolean;
  shortened?: boolean;
};
export type CodeResult = { answer?: Answer; error?: string };
export type Selection = { path: number[]; label: string };
export type ScreenshotAttachment = { id: string; thumbnail: string };
export type CaptureResponse = {
  attachment?: ScreenshotAttachment;
  error?: string;
  cancelled?: boolean;
};
export interface Bridge {
  setSessionContext(context: string): Promise<void>;
  transcribeContext(clip: {
    audio?: Uint8Array;
    mime?: string;
  }): Promise<{ text?: string; error?: string }>;
  capture(): Promise<CaptureResponse>;
  removeScreenshot(): Promise<void>;
  analyzeScreenshot(shotId: string, budget: Budget): Promise<Result>;
  askScreenshot(shotId: string, request: Request): Promise<Result>;
  shortenScreenshot(
    shotId: string,
    id: string,
    budget: Budget,
  ): Promise<Result>;

  code(version: string, path: number[], budget: Budget): Promise<CodeResult>;
  details(version: string, path: number[]): Promise<DetailResult>;
  config(): Promise<{ demo: boolean }>;
  ask(r: Request): Promise<Result>;
  shorten(id: string, budget: Budget): Promise<Result>;
  reset(): Promise<void>;
  pin(value: boolean): Promise<void>;
  microphone(): Promise<boolean>;
  onBlur(fn: () => void): () => void;
}
export function budgetFor(width: number, height: number): Budget {
  return {
    columns: Math.max(16, Math.min(90, Math.floor((width - 32) / 8.5))),
    lines: Math.max(1, Math.min(8, Math.floor((height - 90) / 20))),
    fragments: height < 210 ? 2 : 4,
  };
}
export function overflows(
  el: Pick<
    HTMLElement,
    "scrollHeight" | "clientHeight" | "scrollWidth" | "clientWidth"
  >,
) {
  return (
    el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
  );
}
export function validModeAnswer(a: Answer, mode: Mode) {
  return mode === "explain" ? a.code === "" : a.fragments.length <= 2;
}
