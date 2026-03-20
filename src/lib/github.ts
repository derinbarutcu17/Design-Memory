import type { PullRequestDetails, PullRequestFile, PullRequestSummary } from "@/lib/types";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

type GitHubApiErrorBody = {
  message?: string;
  documentation_url?: string;
};

class GitHubApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

function getGitHubToken(required = false) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT;

  if (!token && required) {
    throw new GitHubApiError(
      "Missing GitHub token. Set GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT in the environment.",
      401,
    );
  }

  return token;
}

async function githubRequest<T>(pathname: string, init?: RequestInit, requiredToken = false) {
  const token = getGitHubToken(requiredToken);
  const url = `${GITHUB_API_BASE}/${pathname.replace(/^\//, "")}`;
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as GitHubApiErrorBody;
      detail = body.message ?? detail;
    } catch {
      // Keep HTTP status text when the body is not JSON.
    }

    if (response.status === 401 || response.status === 403) {
      throw new GitHubApiError(
        token
          ? `GitHub rejected the request. Check token permissions and repo access. (${detail})`
          : "GitHub rejected the request. Set GITHUB_TOKEN, GH_TOKEN, or GITHUB_PAT.",
        response.status,
      );
    }

    throw new GitHubApiError(`GitHub API request failed: ${detail}`, response.status);
  }

  return (await response.json()) as T;
}

async function fetchPaginatedJson<T>(pathname: string, perPage = 100) {
  const items: T[] = [];
  let page = 1;

  while (true) {
    const separator = pathname.includes("?") ? "&" : "?";
    const batch = await githubRequest<T[]>(`${pathname}${separator}per_page=${perPage}&page=${page}`);
    items.push(...batch);
    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }

  return items;
}

async function fetchFileContents(owner: string, repo: string, path: string, ref: string) {
  try {
    const response = await githubRequest<{ content?: string; encoding?: string }>(
      `repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    );

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

export async function listOpenPullRequests(owner: string, repo: string): Promise<PullRequestSummary[]> {
  const pulls = await fetchPaginatedJson<{
    number: number;
    title: string;
    html_url: string;
    updated_at: string;
    user?: { login?: string };
  }>(`repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc`);

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

export async function postPullRequestComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
) {
  await githubRequest(
    `repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
    true,
  );
}

export async function fetchPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetails> {
  const pr = await githubRequest<{
    number: number;
    title: string;
    html_url: string;
    updated_at: string;
    head: { sha: string };
  }>(`repos/${owner}/${repo}/pulls/${prNumber}`);

  const files = await fetchPaginatedJson<{
    filename: string;
    status: string;
    patch?: string;
    additions: number;
    deletions: number;
    changes: number;
    contents_url?: string;
  }>(`repos/${owner}/${repo}/pulls/${prNumber}/files`);

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
