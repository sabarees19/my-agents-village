import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import type { Building, BuildingStage, CommitSummary } from "./schema";
import { localDateString } from "./schema";

const execFileAsync = promisify(execFile);

type GitCommit = {
  sha: string;
  short_sha: string;
  authored_at: string;
  subject: string;
  is_merge: boolean;
  branches?: string[];
};

type GitRepoResult = {
  repo: string;
  commits: GitCommit[];
  error: string | null;
};

type GitScanPayload = {
  repositories: GitRepoResult[];
};

const DEV_TICKET = /\bDEV-(\d+)\b/i;

function scannerPath(): string {
  return path.join(
    os.homedir(),
    ".claude",
    "skills",
    "today-git-commits",
    "scripts",
    "today_git_commits.py",
  );
}

function gitRoot(): string {
  return (
    process.env.BLUME_CODEBASE_ROOT ||
    path.join(os.homedir(), "Documents", "blume", "code-base")
  );
}

function stageForCount(count: number): BuildingStage {
  if (count >= 4) return "roof";
  if (count >= 2) return "scaffolding";
  return "foundation";
}

function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/\bdev-\d+\b/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "work";
}

function buildingKeyForCommit(
  repo: string,
  commit: GitCommit,
): { key: string; label: string } {
  const fromSubject = commit.subject.match(DEV_TICKET);
  if (fromSubject) {
    const key = `DEV-${fromSubject[1]}`;
    return { key, label: key };
  }

  for (const branch of commit.branches ?? []) {
    const fromBranch = branch.match(DEV_TICKET);
    if (fromBranch) {
      const key = `DEV-${fromBranch[1]}`;
      return { key, label: key };
    }
  }

  const repoName = path.basename(repo);
  const slug = normalizeSubject(commit.subject);
  const key = `${repoName}:${slug}`;
  const label =
    commit.subject.length > 36
      ? `${commit.subject.slice(0, 33)}…`
      : commit.subject;
  return { key, label };
}

function layoutPositions(count: number): Array<{ x: number; y: number }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: 18 + col * (70 / Math.max(cols, 1)),
      y: 28 + row * 22,
    });
  }
  return positions;
}

export async function loadTodaysBuildings(
  date = localDateString(),
): Promise<{ buildings: Building[]; error?: string }> {
  const script = scannerPath();
  const root = gitRoot();

  try {
    const { stdout } = await execFileAsync(
      "python3",
      [script, "--json", "--date", date, "--root", root, "--include-branches"],
      {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120_000,
      },
    );

    const payload = JSON.parse(stdout) as GitScanPayload;
    const groups = new Map<
      string,
      {
        label: string;
        repo?: string;
        commits: CommitSummary[];
      }
    >();

    for (const repo of payload.repositories ?? []) {
      if (repo.error) continue;
      for (const commit of repo.commits ?? []) {
        const { key, label } = buildingKeyForCommit(repo.repo, commit);
        const existing = groups.get(key);
        const summary: CommitSummary = {
          sha: commit.sha,
          shortSha: commit.short_sha,
          authoredAt: commit.authored_at,
          subject: commit.subject,
          isMerge: commit.is_merge,
        };
        if (existing) {
          if (!existing.commits.some((c) => c.sha === summary.sha)) {
            existing.commits.push(summary);
          }
        } else {
          groups.set(key, {
            label,
            repo: path.basename(repo.repo),
            commits: [summary],
          });
        }
      }
    }

    const entries = Array.from(groups.entries()).sort(
      (a, b) => b[1].commits.length - a[1].commits.length,
    );
    const positions = layoutPositions(entries.length);

    const buildings: Building[] = entries.map(([key, group], index) => ({
      key,
      label: group.label,
      repo: group.repo,
      stage: stageForCount(group.commits.length),
      kind: "feature",
      size: "md",
      commitCount: group.commits.length,
      commits: group.commits.sort((a, b) =>
        a.authoredAt < b.authoredAt ? 1 : -1,
      ),
      x: positions[index]?.x ?? 50,
      y: positions[index]?.y ?? 50,
    }));

    return { buildings };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to scan git commits";
    return { buildings: [], error: message };
  }
}
