#!/usr/bin/env node
/**
 * Emit an agent-agnostic event to the local My Agentsvillage.
 *
 * Usage:
 *   node scripts/emit-event.mjs --source claude --agent-id a1 --title "Fix login"
 *   node scripts/emit-event.mjs --source codex --agent-id c1 --kind subagent --parent p1 --building DEV-3356
 *   echo '{"source":"cursor","agentKind":"agent","agentId":"x"}' | node scripts/emit-event.mjs --stdin
 */

const BASE = process.env.VILLAGE_URL || "http://localhost:3000";

function parseArgs(argv) {
  const out = { stdin: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--stdin":
        out.stdin = true;
        break;
      case "--source":
        out.source = next();
        break;
      case "--kind":
      case "--agent-kind":
        out.agentKind = next();
        break;
      case "--agent-id":
        out.agentId = next();
        break;
      case "--parent":
      case "--parent-agent-id":
        out.parentAgentId = next();
        break;
      case "--name":
      case "--display-name":
        out.displayName = next();
        break;
      case "--status":
        out.status = next();
        break;
      case "--building":
      case "--building-key":
        out.buildingKey = next();
        break;
      case "--title":
        out.title = next();
        break;
      case "--id":
        out.id = next();
        break;
      case "--url":
        out.url = next();
        break;
      case "--date":
        out.date = next();
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (a.startsWith("-")) {
          console.error(`Unknown flag: ${a}`);
          process.exit(1);
        }
    }
  }
  return out;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

function usage() {
  console.log(`Emit agent event to My Agentsvillage

Options:
  --source cursor|claude|codex|other   (required unless --stdin)
  --agent-id ID                        (required unless --stdin)
  --kind agent|subagent                (default: agent)
  --parent ID                          parent agent for subagents
  --name DISPLAY_NAME
  --status idle|building|done          (default: building)
  --building KEY                       e.g. DEV-3356
  --title TEXT
  --id EVENT_ID                        upsert key (default: source:agentId)
  --date YYYY-MM-DD
  --url BASE_URL                       (default: ${BASE})
  --stdin                              read full JSON event from stdin
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  let event;
  if (args.stdin) {
    event = await readStdin();
    if (!event) {
      console.error("No JSON on stdin");
      process.exit(1);
    }
  } else {
    if (!args.source || !args.agentId) {
      usage();
      process.exit(1);
    }
    event = {
      source: args.source,
      agentKind: args.agentKind || "agent",
      agentId: args.agentId,
      status: args.status || "building",
    };
    if (args.id) event.id = args.id;
    if (args.parentAgentId) event.parentAgentId = args.parentAgentId;
    if (args.displayName) event.displayName = args.displayName;
    if (args.buildingKey) event.buildingKey = args.buildingKey;
    if (args.title) event.title = args.title;
  }

  const base = args.url || BASE;
  const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : "";
  const res = await fetch(`${base}/api/events${qs}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    console.error(body);
    process.exit(1);
  }

  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
