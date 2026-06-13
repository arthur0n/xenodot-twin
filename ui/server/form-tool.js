// Form tool: AskUserQuestion's pattern (pause, render, reply resumes)
// generalized to typed fields. The agent composes the form; the browser
// renders it; the submitted values return as the tool result.
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const FIELD = z.object({
  id: z.string().describe("Result key for this field (snake_case)"),
  label: z.string().describe("Label shown above the field"),
  type: z
    .enum(["text", "textarea", "number", "checkbox", "select", "multiselect", "note"])
    .describe('"note" is read-only (label = heading, value = body) and returns no value'),
  options: z
    .array(
      z.object({
        label: z.string(),
        description: z.string().optional().describe("Shown as a tooltip on the option"),
      }),
    )
    .optional()
    .describe("Choices — required for select/multiselect, ignored otherwise"),
  placeholder: z.string().optional().describe("Hint text for text/textarea/number fields"),
  required: z.boolean().optional().describe("Block submission until answered"),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional()
    .describe("Pre-filled value; array of option labels for multiselect; body text for a note"),
});

/** @param {import("../lib/types.js").WaitFor} waitFor @param {string[]} formAgentQueue */
export function makeFormTool(waitFor, formAgentQueue) {
  return tool(
    "form",
    "Show the user a form and wait for their answers. Use it over AskUserQuestion when you " +
      "need typed input (free text, numbers, toggles) or several answers in one go. The " +
      "session pauses until they submit; answers come back as JSON keyed by field id. " +
      "Keep forms short — ask only what you need to proceed. For an approval or a multi-item " +
      "decision, put a read-only `note` field before each decision field: its label is the " +
      "heading and its value the body (the problem and the proposed change), so the user sees " +
      "what they are deciding before they answer. A `note` returns no value and never blocks " +
      "submission.",
    {
      title: z.string().describe("Card header, a few words"),
      description: z.string().optional().describe("One line of context under the title"),
      fields: z.array(FIELD).min(1).max(10).describe("Fields in display order"),
      submitLabel: z.string().optional().describe('Submit button label, default "Submit"'),
    },
    async (input) => {
      // canUseTool pushed this call's agent just before the handler ran (FIFO).
      const agent = formAgentQueue.shift() ?? "main";
      const reply = await waitFor("form", { input, agent });
      return {
        content: [
          {
            type: "text",
            text: reply?.cancelled
              ? "User dismissed the form without answering."
              : JSON.stringify(reply?.values ?? {}, null, 2),
          },
        ],
      };
    },
  );
}
