import { requireUser } from "@/lib/auth";
import { extractDealsFromSlack } from "@/lib/ai";
import { readChannels } from "@/lib/slack";
import { getStore, log, mutate, newDeal } from "@/lib/store";
import { EditableField } from "@/lib/types";

export const maxDuration = 300;

/** Reads Slack, asks Claude for the current prioritised deal list, and merges it in. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { days = 30 } = await req.json().catch(() => ({}));

  try {
    const slackText = await readChannels(Math.min(Math.max(Number(days) || 30, 1), 120));
    const before = await getStore();
    const extracted = await extractDealsFromSlack(slackText, before.deals);

    const summary = await mutate((store) => {
      let created = 0;
      let updated = 0;
      extracted.forEach((e, i) => {
        const fields: Record<Exclude<EditableField, "priority">, string> = {
          name: e.name,
          status: e.status,
          nextSteps: e.nextSteps,
          owner: e.owner,
        };
        const existing = e.id ? store.deals.find((d) => d.id === e.id) : undefined;
        if (!existing) {
          store.deals.push(newDeal({ ...fields, status: e.status, priority: i + 0.5 }, "slack-sync"));
          created++;
          return;
        }
        // Manual and chat edits win: only touch fields nobody has set by hand.
        let touched = false;
        for (const [k, v] of Object.entries(fields) as [keyof typeof fields, string][]) {
          if (existing.lockedFields.includes(k) || existing[k] === v) continue;
          (existing as unknown as Record<string, string>)[k] = v;
          touched = true;
        }
        if (!existing.lockedFields.includes("priority")) existing.priority = i + 0.5;
        if (touched) {
          existing.updatedAt = new Date().toISOString();
          existing.updatedBy = "slack-sync";
          updated++;
        }
      });
      store.lastSyncedAt = new Date().toISOString();
      const s = `Slack sync: ${created} new, ${updated} updated`;
      log(store, { by: user, source: "slack-sync", summary: s });
      return s;
    });
    return Response.json({ ok: true, summary });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
