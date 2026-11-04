import { requireUser } from "@/lib/auth";
import { log, moveTo, mutate } from "@/lib/store";
import { EDITABLE_FIELDS, EditableField, STATUSES } from "@/lib/types";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const body = await req.json();

  const result = await mutate((store) => {
    const deal = store.deals.find((d) => d.id === id);
    if (!deal) return null;
    const changed: string[] = [];
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      if (field === "priority") {
        moveTo(store.deals, id, Number(body.priority));
      } else if (field === "status") {
        if (!STATUSES.includes(body.status)) continue;
        deal.status = body.status;
      } else {
        deal[field] = String(body[field]);
      }
      if (!deal.lockedFields.includes(field)) deal.lockedFields.push(field as EditableField);
      changed.push(field);
    }
    deal.updatedAt = new Date().toISOString();
    deal.updatedBy = user;
    if (changed.length) log(store, { by: user, source: "manual", summary: `Edited ${changed.join(", ")} on "${deal.name}"` });
    return deal;
  });
  return result ? Response.json(result) : Response.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const ok = await mutate((store) => {
    const deal = store.deals.find((d) => d.id === id);
    if (!deal) return false;
    store.deals = store.deals.filter((d) => d.id !== id);
    log(store, { by: user, source: "manual", summary: `Deleted "${deal.name}"` });
    return true;
  });
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
}
