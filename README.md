# Locker Deals

A small internal app that reads the `#lockers-legal` Slack channel and keeps a prioritised list of
Locker Team deals: **Deal Name, Status, Expected Next Steps, Owner**.

- **Sync from Slack**: reads the last 30 days of the channel (with thread replies), and Claude works out
  the current deals, their status, next steps, owner and priority order.
- **Edit anything**: click a cell to edit it, change the status from the dropdown, reorder with ▲ ▼,
  add or delete deals.
- **Chat box**: type an update in plain words ("BOXPARK: UK entity with guarantor, Jess drafts the
  guarantee by Friday", "move Noel to the top") and the list updates.
- **Your edits win**: any field you set by hand or via chat is never overwritten by a later Slack sync.
- **Restricted access**: Google sign-in, and only emails in `ALLOWED_EMAILS` get in. Every API route
  checks it too.

## Run it locally

```bash
cp .env.example .env.local   # then fill it in
npm install
npm run dev
```

Open http://localhost:3000.

### What you need for `.env.local`

| Variable | Where it comes from |
| --- | --- |
| `ALLOWED_EMAILS` | Comma-separated emails that may use the app (`michael@bounce.com` for now) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud console, OAuth client (Web). Redirect URI: `<NEXTAUTH_URL>/api/auth/callback/google` |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | The app's URL, and a random string (`openssl rand -base64 32`) |
| `SLACK_BOT_TOKEN` | A Slack app with `channels:history`, `groups:history`, `users:read`. **Invite the bot to `#lockers-legal`** (it's private) |
| `SLACK_CHANNEL_IDS` | `C087D2EL5L7` (`#lockers-legal`). Add more IDs comma-separated if needed |
| `ANTHROPIC_API_KEY` | Claude API key |

## How it's built

- Next.js 16 (App Router) + NextAuth (Google) + Anthropic TypeScript SDK.
- `lib/slack.ts`: reads channel history and threads, resolves user names.
- `lib/ai.ts`: two Claude calls with structured (schema-validated) output: one turns Slack history into
  the deal list, one turns a chat message into edit operations. Uses server-side refusal fallbacks.
- `lib/store.ts`: deals are stored in `data/deals.json` (first draft). Each deal records which fields
  were set by a person (`lockedFields`), and there's a short activity log ("Recent changes").

## Known limits of this first draft

- Storage is a JSON file, so it needs a host with a persistent disk and a single instance. Next step is
  Postgres.
- Sync is manual (button). A scheduled sync is easy to add once it's hosted.
- Statuses are a fixed list (`lib/types.ts`), easy to change.
