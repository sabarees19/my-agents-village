# My Agents Village

A local **Clash of Clans–style 3D village** for today’s AI agent work.

Each Cursor (or Claude / Codex) chat becomes a building on the map. Subagents appear as small cottages beside their parent. Colored builders walk the site while a turn is active, then head home to a distant hut when they’re done.

Built with Next.js, React Three Fiber, and drei.

## What you see

| On the map | Meaning |
| --- | --- |
| **Chat building** | A parent agent conversation from today |
| **Cottage** | A subagent / sub-chat next to its parent |
| **Builder** | Live agent; color = source (`cursor` / `claude` / `codex` / `other`) |
| **Hut** | Idle / finished agents walk home here |
| **WIP yard** | Manual events with no matching chat building |

Labels prefer official Cursor chat titles (from the conversation search DB), with a sensible fallback.

## Features

- **Auto Cursor ingest** — scans today’s transcripts under `~/.cursor/projects/*/agent-transcripts` (including `subagents/`)
- **Busy / done status** — parents stay “building” while the transcript is freshly active; subagents latch to done after they finish
- **Agent-agnostic events** — Claude, Codex, or anything else can `POST /api/events`
- **Touch map controls** — one-finger pan, pinch zoom (Clash-like orbit); desktop drag + scroll
- **Search + focus** — find a chat and fly the camera to that building
- **Live refresh** — village API polled every few seconds

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Village API

`GET /api/village` — today’s buildings + agents (JSON). Used by the 3D UI.

## Emit an agent event (any tool)

Agent-agnostic ingest: `POST /api/events`

```bash
# Claude
npm run emit -- --source claude --agent-id claude-1 --title "Auth fix"

# Codex subagent
npm run emit -- --source codex --agent-id explore-1 --kind subagent --parent codex-main

# Cursor
npm run emit -- --source cursor --agent-id cursor-1 --name "Main agent" --status building

# Raw JSON
echo '{"source":"other","agentKind":"agent","agentId":"bot-9","title":"Docs"}' \
  | npm run emit -- --stdin
```

Or with curl:

```bash
curl -s http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{
    "source": "claude",
    "agentKind": "agent",
    "agentId": "session-42",
    "displayName": "Claude",
    "status": "building",
    "title": "Returning session token"
  }'
```

### Event shape

| Field | Required | Notes |
| --- | --- | --- |
| `source` | yes | `cursor` \| `claude` \| `codex` \| `other` |
| `agentKind` | yes | `agent` \| `subagent` |
| `agentId` | yes | stable id within the source |
| `id` | no | upsert key; default `source:agentId` |
| `parentAgentId` | no | for subagents |
| `displayName` | no | label on hover / panel |
| `status` | no | `idle` \| `building` \| `done` (default `building`) |
| `buildingKey` | no | bind to a chat; unmatched working agents → WIP yard |
| `title` | no | what they are building / chat label |
| `startedAt` / `updatedAt` | no | ISO timestamps |

Manual events for today live in `data/events/YYYY-MM-DD.jsonl`.

## Stack

- Next.js (App Router) + React 19
- Three.js via `@react-three/fiber` + `@react-three/drei`
- TypeScript + Tailwind

## Privacy

Everything runs locally. Cursor transcripts are read from your machine; nothing is uploaded by this app.
