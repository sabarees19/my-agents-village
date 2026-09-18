# My Agents

Local Clash-of-Clans-style village for **today’s work**.

- **Buildings** = features from today’s git commits (Blume codebase)
- **Characters** = 3D action-figure builders (agents + smaller glowing subagents)
- **Colors** = source (`cursor` / `claude` / `codex` / `other`) + subagent shade
- **Auto Cursor** = today’s agent transcripts under `~/.cursor/projects/*/agent-transcripts` (including `subagents/`) show up automatically

Multiple sources can appear on the map at the same time. Drag to orbit, scroll to zoom.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Git scan uses:

```bash
python3 ~/.claude/skills/today-git-commits/scripts/today_git_commits.py \
  --json --root ~/Documents/blume/code-base
```

Override the repo root with `BLUME_CODEBASE_ROOT`.

## Emit an agent event (any tool)

Agent-agnostic ingest: `POST /api/events`

```bash
# Claude
npm run emit -- --source claude --agent-id claude-1 --title "Auth fix" --building DEV-3356

# Codex subagent
npm run emit -- --source codex --agent-id explore-1 --kind subagent --parent codex-main --building DEV-3356

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
    "buildingKey": "DEV-3356",
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
| `buildingKey` | no | e.g. `DEV-3356`; unmatched → WIP yard |
| `title` | no | what they are building |
| `startedAt` / `updatedAt` | no | ISO timestamps |

Events for today live in `data/events/YYYY-MM-DD.jsonl`.

## Village API

`GET /api/village` — merges today’s buildings + agents (refreshes in the UI every ~20s).
