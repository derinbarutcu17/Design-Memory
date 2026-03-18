import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { PullRequestDetails, PullRequestFile, PullRequestSummary } from "@/lib/types";

const execFileAsync = promisify(execFile);

async function ghJson<T>(args: string[]) {
  const { stdout } = await execFileAsync("gh", ["api", ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function fetchFileContents(owner: string, repo: string, path: string, ref: string) {
  try {
    const response = await ghJson<{ content?: string; encoding?: string }>([
      `repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
    ]);

    if (response.encoding === "base64" && response.content) {
      return Buffer.from(response.content.replace(/\n/g, ""), "base64").toString("utf8");
    }
  } catch {
    return "";
  }

  return "";
}

function isUiFile(fileName: string) {
  return /\.(tsx|jsx|ts|js|css|scss)$/.test(fileName);
}

export async function listOpenPullRequests(
  owner: string,
  repo: string,
): Promise<PullRequestSummary[]> {
  const pulls = await ghJson<
    Array<{
      number: number;
      title: string;
      html_url: string;
      updated_at: string;
      user?: { login?: string };
    }>
  >([`repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=10`]);

  return pulls.map((pull) => ({
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    updatedAt: pull.updated_at,
    authorLogin: pull.user?.login,
  }));
}

export async function fetchLatestOpenPullRequest(owner: string, repo: string) {
  const pulls = await listOpenPullRequests(owner, repo);
  return pulls[0] ?? null;
}

export async function fetchPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetails> {
  const pr = await ghJson<{
    number: number;
    title: string;
    html_url: string;
    updated_at: string;
    head: { sha: string };
  }>([`repos/${owner}/${repo}/pulls/${prNumber}`]);

  const files = await ghJson<
    Array<{
      filename: string;
      status: string;
      patch?: string;
      additions: number;
      deletions: number;
      changes: number;
      contents_url?: string;
    }>
  >([`repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`]);

  const hydratedFiles: PullRequestFile[] = [];

  for (const file of files) {
    if (!isUiFile(file.filename)) {
      continue;
    }

    hydratedFiles.push({
      filename: file.filename,
      status: file.status,
      patch: file.patch,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      contentsUrl: file.contents_url,
      contents: await fetchFileContents(owner, repo, file.filename, pr.head.sha),
    });
  }

  return {
    number: pr.number,
    title: pr.title,
    headSha: pr.head.sha,
    url: pr.html_url,
    updatedAt: pr.updated_at,
    files: hydratedFiles,
  };
}
