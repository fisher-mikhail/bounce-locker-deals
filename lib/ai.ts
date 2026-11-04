import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { Deal, STATUSES } from "./types";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

const StatusEnum = z.enum(STATUSES);

const DealFields = z.object({
  name: z.string().describe("Short deal name, e.g. 'BOXPARK Shoreditch' or 'APCOA UK'"),
  status: StatusEnum,
  nextSteps: z.string().describe("Concrete expected next step(s), who does what, and any deadline"),
  owner: z.string().describe("Bounce person driving the deal (first names)"),
});

const Operation = z.object({
  action: z.enum(["update", "create", "delete"]),
  id: z.string().nullable().describe("Existing deal id for update/delete; null for create"),
  name: z.string().nullable(),
  status: StatusEnum.nullable(),
  nextSteps: z.string().nullable(),
  owner: z.string().nullable(),
  priority: z.number().int().nullable().describe("New 1-based position, or null to leave as is"),
});
export type Operation = z.infer<typeof Operation>;

const SyncResult = z.object({
  deals: z.array(
    DealFields.extend({
      id: z.string().nullable().describe("Id of the matching existing deal, or null if it is new"),
    }),
  ),
});

const ChatResult = z.object({
  reply: z.string().describe("Short confirmation of what changed, or a clarifying question"),
  operations: z.array(Operation),
});

const CONTEXT = `You maintain the Bounce Locker Team's list of deals that need legal involvement.
Bounce's legal counsel is Jess. The locker business team includes Francisco, Ghislain and Michael.
Statuses (pick exactly one):
- Waiting on Legal: Jess needs to draft, redline, review or answer
- Waiting on Business: the locker team owes something (info, a draft, a decision)
- Waiting on Counterparty: ball is with the partner
- Ready to Sign: terms agreed, signature pending
- Signed: done (keep it in the list until someone deletes it)
- On Hold: dormant or explicitly paused`;

function dealsForPrompt(deals: Deal[]) {
  return JSON.stringify(
    deals.map(({ id, name, status, nextSteps, owner, priority }) => ({ id, priority, name, status, nextSteps, owner })),
    null,
    2,
  );
}

async function run<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T>> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    // If a safety classifier declines, the API retries on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (response.stop_reason === "max_tokens") throw new Error("The model's answer was cut off. Try a shorter time window.");
  if (!response.parsed_output) throw new Error("Could not parse the model's answer.");
  return response.parsed_output as z.infer<T>;
}

/** Reads Slack history and returns the full deal list in priority order (first = highest). */
export async function extractDealsFromSlack(slackText: string, current: Deal[]) {
  const system = `${CONTEXT}

Your job: read the Slack history and produce the current list of locker deals, in priority order
(first = most important). Prioritise by explicit priority statements from the team (e.g. a numbered list
from the deal owner, or a manager saying "only work on X"), then deadlines, then commercial impact.
Later messages override earlier ones. Merge mentions of the same deal. Ignore pure admin chatter
(people joining/leaving). Include non-deal legal asks (templates, insurance questions, NDAs) only if
they are concrete pieces of work that are still open.

When a deal matches one in the current list, return its id so it is updated rather than duplicated.
Keep current deals that Slack no longer mentions, unchanged, unless Slack clearly shows they are done.`;
  const user = `Current deal list:\n${dealsForPrompt(current)}\n\nSlack history:\n${slackText}`;
  return (await run(SyncResult, system, user)).deals;
}

/** Turns a free-text update from the user into edits to the deal list. */
export async function interpretChat(message: string, current: Deal[], by: string) {
  const system = `${CONTEXT}

The user (${by}) is telling you about updates to the deals. Translate their message into operations:
- update: set only the fields that change (others null). Use the existing id.
- create: a new deal (id null). Fill name, status, nextSteps, owner; priority if they gave one.
- delete: only if the user clearly asks to remove a deal.
- priority: a 1-based position in the list; set it when the user reorders.
If the message is ambiguous (e.g. you can't tell which deal), return no operations and ask in reply.
Keep the reply to one or two sentences. Today is ${new Date().toISOString().slice(0, 10)}.`;
  const user = `Current deal list:\n${dealsForPrompt(current)}\n\nUser message:\n${message}`;
  return run(ChatResult, system, user);
}
