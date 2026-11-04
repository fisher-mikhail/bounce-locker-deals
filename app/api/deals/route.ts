import { requireUser } from "@/lib/auth";
import { getStore, log, moveTo, mutate, newDeal, sortDeals } from "@/lib/store";
import { STATUSES, Status } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const store = await getStore();
  return Response.json({ ...store, deals: sortDeals(store.deals), activity: store.activity.slice(-30).reverse() });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
  const status: Status = STATUSES.includes(body.status) ? body.status : "Waiting on Business";
  const deal = await mutate((store) => {
    const d = newDeal(
      { name, status, nextSteps: String(body.nextSteps || ""), owner: String(body.owner || "") },
      user,
      ["name", "status", "nextSteps", "owner"],
    );
    store.deals.push(d);
    if (body.priority) moveTo(store.deals, d.id, Number(body.priority));
    log(store, { by: user, source: "manual", summary: `Added "${name}"` });
    return d;
  });
  return Response.json(deal);
}
