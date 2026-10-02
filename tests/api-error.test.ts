import { expect, it } from "vitest";
import { apiErrorMessage } from "../electron/api-error";
it("distinguishes quota exhaustion from retryable rate limiting", () => {
  expect(
    apiErrorMessage(
      429,
      { error: { type: "insufficient_quota" } },
      "Transcription",
    ),
  ).toContain("API credits");
  expect(
    apiErrorMessage(429, { error: { code: "rate_limit_exceeded" } }, "Answer"),
  ).toContain("Wait briefly");
});
it("identifies the failed stage and status without exposing provider messages", () => {
  const message = apiErrorMessage(
    401,
    { error: { message: "secret-key and private transcript" } },
    "Transcription",
  );
  expect(message).toContain("Transcription failed (HTTP 401)");
  expect(message).not.toContain("secret-key");
  expect(message).not.toContain("private transcript");
});
it("handles non-JSON failures and unknown models", () => {
  expect(apiErrorMessage(502, undefined, "Answer")).toContain(
    "temporarily unavailable",
  );
  expect(
    apiErrorMessage(404, { error: { code: "model_not_found" } }, "Answer"),
  ).toContain("Model unavailable");
});
