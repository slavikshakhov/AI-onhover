// Never return the provider's raw message: it can echo request content or credentials.
export function apiErrorMessage(
  status: number,
  body: unknown,
  stage: string,
): string {
  const error =
    body && typeof body === "object" && "error" in body
      ? body.error
      : undefined;
  const fields =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const codes = [fields.code, fields.type];
  let message: string;
  if (status === 401)
    message = "API key rejected. Check OPENAI_API_KEY in .env and restart.";
  else if (
    codes.some(
      (code) =>
        typeof code === "string" &&
        [
          "insufficient_quota",
          "billing_hard_limit_reached",
          "billing_not_active",
          "usage_limit_reached",
          "organization_usage_limit_exceeded",
        ].includes(code),
    )
  )
    message =
      "API credits or spending limit exhausted. Check OpenAI API billing and project limits; ChatGPT Plus does not cover API usage.";
  else if (status === 429)
    message = "OpenAI rate limit reached. Wait briefly, then try again.";
  else if (status === 403)
    message = "API access denied. Check project permissions and model access.";
  else if (status === 404 || codes.includes("model_not_found"))
    message =
      "Model unavailable. Check the configured model name and project access, then restart.";
  else if (status >= 500)
    message = "OpenAI is temporarily unavailable. Try again shortly.";
  else if (status === 400 && stage === "Transcription")
    message =
      "OpenAI rejected the audio or transcription settings. Try a longer recording and check OPENAI_TRANSCRIBE_MODEL.";
  else
    message =
      "OpenAI rejected the request. Check model settings and API access.";
  return `${stage} failed (HTTP ${status}). ${message}`;
}
