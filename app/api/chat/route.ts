import { requireUser } from "@/lib/auth";
import { interpretChat } from "@/lib/ai";
import { getStore, log, moveTo, mutate, newDeal } from "@/lib/store";
import { EditableField } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { message } = await req.json();
  if (!message?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

  try {
    const { deals } = await getStore();
    const { reply, operations } = await interpretChat(String(message), deals, user);

    const applied = await mutate((store) => {
      const notes: string[] = [];
      for (const op of operations) {
        if (op.action === "create" && op.name) {
          const d = newDeal(
            {
              name: op.name,
              status: op.status ?? "Waiting on Business",
              nextSteps: op.nextSteps ?? "",
              owner: op.owner ?? "",
            },
            user,
            ["name", "status", "nextSteps", "owner"],
          );
          store.deals.push(d);
          if (op.priority) moveTo(store.deals, d.id, op.priority);
          notes.push(`added "${d.name}"`);
          continue;
        }
        const deal = store.deals.find((d) => d.id === op.id);
        if (!deal) continue;
        if (op.action === "delete") {
          store.deals = store.deals.filter((d) => d.id !== deal.id);
          notes.push(`deleted "${deal.name}"`);
          continue;
        }
        const changed: EditableField[] = [];
        if (op.name) (deal.name = op.name), changed.push("name");
        if (op.status) (deal.status = op.status), changed.push("status");
        if (op.nextSteps !== null) (deal.nextSteps = op.nextSteps), changed.push("nextSteps");
        if (op.owner) (deal.owner = op.owner), changed.push("owner");
        if (op.priority) moveTo(store.deals, deal.id, op.priority), changed.push("priority");
        for (const f of changed) if (!deal.lockedFields.includes(f)) deal.lockedFields.push(f);
        deal.updatedAt = new Date().toISOString();
        deal.updatedBy = user;
        if (changed.length) notes.push(`updated ${changed.join(", ")} on "${deal.name}"`);
      }
      if (notes.length) log(store, { by: user, source: "chat", summary: `${message}`.slice(0, 200) + ` → ${notes.join("; ")}` });
      return notes;
    });

    return Response.json({ reply, applied });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
