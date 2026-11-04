// Reads #lockers-legal (and any other channels in SLACK_CHANNEL_IDS) with the Slack Web API.
// The bot token needs channels:history, groups:history (private channels), users:read,
// and the bot must be invited to each channel.

const SLACK = "https://slack.com/api";

async function call<T>(method: string, params: Record<string, string>): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  const res = await fetch(`${SLACK}/${method}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Slack ${method} failed: ${body.error}`);
  return body as T;
}

interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  reply_count?: number;
  files?: { name?: string }[];
}

const userCache = new Map<string, string>();
async function userName(id: string): Promise<string> {
  if (userCache.has(id)) return userCache.get(id)!;
  try {
    const { user } = await call<{ user: { real_name?: string; name: string } }>("users.info", { user: id });
    userCache.set(id, user.real_name || user.name);
  } catch {
    userCache.set(id, id);
  }
  return userCache.get(id)!;
}

async function resolveMentions(text: string): Promise<string> {
  const ids = [...new Set([...text.matchAll(/<@([A-Z0-9]+)(\|[^>]*)?>/g)].map((m) => m[1]))];
  for (const id of ids) {
    const name = await userName(id);
    text = text.replace(new RegExp(`<@${id}(\\|[^>]*)?>`, "g"), `@${name}`);
  }
  return text;
}

async function format(m: SlackMessage, indent = ""): Promise<string> {
  const who = m.user ? await userName(m.user) : "unknown";
  const when = new Date(Number(m.ts) * 1000).toISOString().slice(0, 16).replace("T", " ");
  const files = m.files?.length ? ` [files: ${m.files.map((f) => f.name).join(", ")}]` : "";
  return `${indent}[${when}] ${who}: ${await resolveMentions(m.text || "")}${files}`;
}

/** Returns the channel history (with thread replies) as plain text, oldest first. */
export async function readChannels(days: number): Promise<string> {
  const channels = (process.env.SLACK_CHANNEL_IDS || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!channels.length) throw new Error("SLACK_CHANNEL_IDS is not set");
  const oldest = String(Math.floor(Date.now() / 1000) - days * 86400);
  const out: string[] = [];

  for (const channel of channels) {
    const messages: SlackMessage[] = [];
    let cursor: string | undefined;
    do {
      const page = await call<{ messages: SlackMessage[]; response_metadata?: { next_cursor?: string } }>(
        "conversations.history",
        { channel, oldest, limit: "200", ...(cursor ? { cursor } : {}) },
      );
      messages.push(...page.messages);
      cursor = page.response_metadata?.next_cursor || undefined;
    } while (cursor);

    out.push(`=== Channel ${channel} ===`);
    for (const m of messages.reverse()) {
      if (m.subtype === "channel_join" || m.subtype === "channel_leave") continue;
      out.push(await format(m));
      if (m.reply_count) {
        const { messages: replies } = await call<{ messages: SlackMessage[] }>("conversations.replies", {
          channel,
          ts: m.ts,
          limit: "200",
        });
        for (const r of replies.slice(1)) out.push(await format(r, "    ↳ "));
      }
    }
  }
  return out.join("\n");
}
