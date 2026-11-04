export const STATUSES = [
  "Waiting on Legal",
  "Waiting on Business",
  "Waiting on Counterparty",
  "Ready to Sign",
  "Signed",
  "On Hold",
] as const;
export type Status = (typeof STATUSES)[number];

export const EDITABLE_FIELDS = ["name", "status", "nextSteps", "owner", "priority"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface Deal {
  id: string;
  name: string;
  status: Status;
  nextSteps: string;
  owner: string;
  /** 1 = highest priority. */
  priority: number;
  /** Fields a person set by hand or via chat. Slack sync will not overwrite them. */
  lockedFields: EditableField[];
  updatedAt: string;
  updatedBy: string;
}

export interface ActivityEntry {
  at: string;
  by: string;
  source: "manual" | "chat" | "slack-sync";
  summary: string;
}

export interface Store {
  deals: Deal[];
  activity: ActivityEntry[];
  lastSyncedAt: string | null;
}
