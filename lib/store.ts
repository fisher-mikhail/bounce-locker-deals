import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ActivityEntry, Deal, EditableField, Store } from "./types";

// First draft: a JSON file on disk. Swap for Postgres when this is deployed somewhere
// with more than one instance or an ephemeral filesystem.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "deals.json");

let queue: Promise<unknown> = Promise.resolve();

async function read(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Store;
  } catch {
    return { deals: [], activity: [], lastSyncedAt: null };
  }
}

async function write(store: Store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(store, null, 2));
  await fs.rename(tmp, FILE);
}

export function getStore(): Promise<Store> {
  return read();
}

/** Serialises read-modify-write so concurrent requests don't clobber each other. */
export function mutate<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const store = await read();
    const result = await fn(store);
    normalisePriorities(store.deals);
    store.activity = store.activity.slice(-200);
    await write(store);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export function sortDeals(deals: Deal[]): Deal[] {
  return [...deals].sort((a, b) => a.priority - b.priority);
}

/** Keeps priorities as a clean 1..n sequence in current order. */
export function normalisePriorities(deals: Deal[]) {
  sortDeals(deals).forEach((d, i) => {
    const target = deals.find((x) => x.id === d.id)!;
    target.priority = i + 1;
  });
}

export function newDeal(
  fields: Partial<Deal> & Pick<Deal, "name">,
  by: string,
  locked: EditableField[] = [],
): Deal {
  return {
    id: randomUUID(),
    status: "Waiting on Business",
    nextSteps: "",
    owner: "",
    priority: 999,
    ...fields,
    lockedFields: locked,
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
}

export function log(store: Store, entry: Omit<ActivityEntry, "at">) {
  store.activity.push({ at: new Date().toISOString(), ...entry });
}

/** Moves a deal to a 1-based position, shifting the others. */
export function moveTo(deals: Deal[], id: string, position: number) {
  const ordered = sortDeals(deals).filter((d) => d.id !== id);
  const deal = deals.find((d) => d.id === id);
  if (!deal) return;
  const idx = Math.max(0, Math.min(ordered.length, position - 1));
  ordered.splice(idx, 0, deal);
  ordered.forEach((d, i) => (d.priority = i + 1));
}
