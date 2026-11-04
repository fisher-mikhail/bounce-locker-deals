"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry, Deal } from "@/lib/types";
import { STATUSES } from "@/lib/types";

type ChatMsg = { role: "user" | "assistant"; text: string };

const STATUS_CLASS: Record<string, string> = {
  "Waiting on Legal": "s-legal",
  "Waiting on Business": "s-business",
  "Waiting on Counterparty": "s-counterparty",
  "Ready to Sign": "s-ready",
  Signed: "s-signed",
  "On Hold": "s-hold",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body as T;
}

export default function Board({ user }: { user: string }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "assistant", text: 'Tell me what changed, e.g. "BOXPARK: going with the UK entity plus guarantor, Jess drafts the guarantee by Friday".' },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const data = await api<{ deals: Deal[]; activity: ActivityEntry[]; lastSyncedAt: string | null }>("/api/deals");
    setDeals(data.deals);
    setActivity(data.activity);
    setLastSyncedAt(data.lastSyncedAt);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => chatEnd.current?.scrollIntoView({ behavior: "smooth" }), [chat]);

  async function update(id: string, changes: Partial<Deal>) {
    setError(null);
    try {
      await api(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(deal: Deal) {
    if (!confirm(`Delete "${deal.name}"?`)) return;
    await api(`/api/deals/${deal.id}`, { method: "DELETE" });
    await load();
  }

  async function add() {
    const name = prompt("Deal name");
    if (!name) return;
    await api("/api/deals", { method: "POST", body: JSON.stringify({ name }) });
    await load();
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const { summary } = await api<{ summary: string }>("/api/sync", { method: "POST", body: JSON.stringify({ days: 30 }) });
      setChat((c) => [...c, { role: "assistant", text: summary }]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || thinking) return;
    setDraft("");
    setChat((c) => [...c, { role: "user", text: message }]);
    setThinking(true);
    try {
      const { reply, applied } = await api<{ reply: string; applied: string[] }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      const detail = applied.length ? `\n\nChanged: ${applied.join("; ")}` : "";
      setChat((c) => [...c, { role: "assistant", text: reply + detail }]);
      await load();
    } catch (err) {
      setChat((c) => [...c, { role: "assistant", text: `Error: ${(err as Error).message}` }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="layout">
      <header>
        <div>
          <h1>Locker Deals</h1>
          <span className="muted">
            {lastSyncedAt ? `Last Slack sync ${new Date(lastSyncedAt).toLocaleString()}` : "Not synced with Slack yet"}
          </span>
        </div>
        <div className="actions">
          <button className="btn" onClick={add}>+ Add deal</button>
          <button className="btn primary" onClick={sync} disabled={syncing}>
            {syncing ? "Reading Slack…" : "Sync from Slack"}
          </button>
          <span className="muted small">{user}</span>
          <a className="btn ghost" href="/api/auth/signout">Sign out</a>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="main">
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="col-p">#</th>
                <th>Deal Name</th>
                <th>Status</th>
                <th>Expected Next Steps</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">No deals yet. Click “Sync from Slack” or add one.</td>
                </tr>
              )}
              {deals.map((d, i) => (
                <tr key={d.id}>
                  <td className="col-p">
                    <div className="prio">
                      <button title="Move up" disabled={i === 0} onClick={() => update(d.id, { priority: i })}>▲</button>
                      <span>{d.priority}</span>
                      <button title="Move down" disabled={i === deals.length - 1} onClick={() => update(d.id, { priority: i + 2 })}>▼</button>
                    </div>
                  </td>
                  <td><Editable value={d.name} onSave={(v) => update(d.id, { name: v })} bold /></td>
                  <td>
                    <select className={`status ${STATUS_CLASS[d.status]}`} value={d.status} onChange={(e) => update(d.id, { status: e.target.value as Deal["status"] })}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><Editable value={d.nextSteps} onSave={(v) => update(d.id, { nextSteps: v })} multiline /></td>
                  <td><Editable value={d.owner} onSave={(v) => update(d.id, { owner: v })} /></td>
                  <td>
                    <button className="icon" title={`Updated by ${d.updatedBy} ${new Date(d.updatedAt).toLocaleString()}. Delete`} onClick={() => remove(d)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Fields you edit by hand or via chat are kept on the next Slack sync. Click any cell to edit.
          </p>
          {activity.length > 0 && (
            <details className="activity">
              <summary>Recent changes</summary>
              <ul>
                {activity.map((a, i) => (
                  <li key={i}>
                    <span className="muted small">{new Date(a.at).toLocaleString()} · {a.source} · {a.by}</span>
                    <div>{a.summary}</div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <aside className="chat">
          <h2>Updates</h2>
          <div className="messages">
            {chat.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>{m.text}</div>
            ))}
            {thinking && <div className="msg assistant muted">Updating…</div>}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={send}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) send(e);
              }}
              placeholder="What changed? (Enter to send)"
              rows={3}
            />
            <button className="btn primary" disabled={thinking || !draft.trim()}>Send</button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function Editable({ value, onSave, multiline, bold }: { value: string; onSave: (v: string) => void; multiline?: boolean; bold?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  const commit = () => {
    setEditing(false);
    if (v.trim() !== value) onSave(v.trim());
  };

  if (!editing) {
    return (
      <div className={`cell ${bold ? "bold" : ""}`} onClick={() => setEditing(true)} title="Click to edit">
        {value || <span className="muted">-</span>}
      </div>
    );
  }
  const props = {
    autoFocus: true,
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") (setV(value), setEditing(false));
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) commit();
    },
  };
  return multiline ? <textarea rows={4} {...props} /> : <input {...props} />;
}
