import { requirementsSchema } from "../electron/screenshot-review";
// Legacy format tests isolate the answer-format stage. Review orchestration is
// covered separately with explicit implementation/output requirement fixtures.
export const requirements = requirementsSchema.parse({
  intent: "explain",
  behavior: [],
  signature: "",
  inputs: [],
  outputFormat: [],
  ordering: [],
  mutation: [],
  performance: [],
  examples: [],
  missing: [],
  essentialUnreadable: false,
});
export function withReviewFixture(transport: typeof fetch): typeof fetch {
  return async (url, init) => {
    if (typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      const name = body.text?.format?.name;
      if (name === "screenshot_requirements" || name === "screenshot_review")
        return new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(
                      name === "screenshot_requirements"
                        ? requirements
                        : { verdict: "pass", issues: [], checks: ["fixture"] },
                    ),
                  },
                ],
              },
            ],
          }),
        );
    }
    return transport(url, init);
  };
}
