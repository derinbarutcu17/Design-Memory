"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { analyzeDrift } from "@/lib/audit";
import { syncReferenceSnapshotFromFigma } from "@/lib/figma/normalize-reference";
import {
  fetchLatestOpenPullRequest,
  fetchPullRequest,
} from "@/lib/github";
import { createProjectSchema, referenceSnapshotSchema } from "@/lib/schema";
import { sampleReferenceSnapshot } from "@/lib/sample-reference";
import {
  buildInheritedReviews,
  createAuditRun,
  createProject,
  createReferenceSnapshot,
  getAuditRun,
  getProjectDetails,
  listAuditRuns,
  listIssuesForAuditRun,
  listReviewsForAuditRun,
  upsertIssueReview,
  updateProject,
} from "@/lib/store";
import type { ReviewStatus } from "@/lib/types";
import { makeId, parseFigmaUrl, parseGitHubRepoUrl } from "@/lib/utils";

function homeMessageRedirect(status: "success" | "error", message: string) {
  const query = new URLSearchParams({ status, message });
  redirect(`/?${query.toString()}`);
}

function projectMessageRedirect(projectId: string, status: "success" | "error", message: string) {
  const query = new URLSearchParams({ status, message });
  redirect(`/projects/${projectId}?${query.toString()}`);
}

export async function createProjectAction(formData: FormData) {
  try {
    const parsed = createProjectSchema.parse({
      name: formData.get("name"),
      figmaUrl: formData.get("figmaUrl"),
      repoUrl: formData.get("repoUrl"),
    });
    const { figmaFileKey } = parseFigmaUrl(parsed.figmaUrl);
    const { owner, repo } = parseGitHubRepoUrl(parsed.repoUrl);

    const project = createProject({
      name: parsed.name,
      figmaUrl: parsed.figmaUrl,
      repoUrl: parsed.repoUrl,
      figmaFileKey,
      repoOwner: owner,
      repoName: repo,
    });
    revalidatePath("/");
    redirect(`/projects/${project.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project creation failed.";
    homeMessageRedirect("error", message);
  }
}

export async function updateProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  try {
    const rawFigmaUrl = String(formData.get("figmaUrl"));
    const rawRepoUrl = String(formData.get("repoUrl"));
    const { figmaFileKey } = parseFigmaUrl(rawFigmaUrl);
    const { owner, repo } = parseGitHubRepoUrl(rawRepoUrl);

    updateProject(projectId, {
      figmaUrl: rawFigmaUrl,
      repoUrl: rawRepoUrl,
      figmaFileKey,
      repoOwner: owner,
      repoName: repo,
    });
    revalidatePath(`/projects/${projectId}`);
    projectMessageRedirect(projectId, "success", "Connection details updated.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection update failed.";
    projectMessageRedirect(projectId, "error", message);
  }
}

export async function importReferenceAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  try {
    const rawReference = String(formData.get("referenceJson"));
    const parsed = referenceSnapshotSchema.parse(JSON.parse(rawReference));
    createReferenceSnapshot(projectId, parsed);
    revalidatePath(`/projects/${projectId}`);
    projectMessageRedirect(projectId, "success", "Fallback reference snapshot imported.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual import failed.";
    projectMessageRedirect(projectId, "error", message);
  }
}

export async function importSampleReferenceAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  createReferenceSnapshot(projectId, sampleReferenceSnapshot);
  revalidatePath(`/projects/${projectId}`);
  projectMessageRedirect(projectId, "success", "Sample fallback reference loaded.");
}

export async function syncFigmaReferenceAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  try {
    const snapshot = await syncReferenceSnapshotFromFigma(details.project.figmaFileKey);
    createReferenceSnapshot(projectId, snapshot);
    revalidatePath(`/projects/${projectId}`);
    projectMessageRedirect(
      projectId,
      "success",
      `Synced ${snapshot.metadata.componentCount ?? 0} components from Figma.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Figma sync failed.";
    projectMessageRedirect(projectId, "error", message);
  }
}

async function runAuditForPullRequest(
  projectId: string,
  prNumber: number,
  prSelectionMode: "auto-latest" | "manual",
) {
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  const snapshot = await syncReferenceSnapshotFromFigma(details.project.figmaFileKey);
  const latestSnapshot = createReferenceSnapshot(projectId, snapshot);
  const pr = await fetchPullRequest(details.project.repoOwner, details.project.repoName, prNumber);

  if (pr.files.length === 0) {
    throw new Error("No UI-related changes found in that pull request.");
  }

  const previousRun = listAuditRuns(projectId)[0];
  const previousIssues = previousRun ? listIssuesForAuditRun(previousRun.id) : [];
  const previousReviews = previousRun
    ? listReviewsForAuditRun(previousRun.id).map((review) => ({
        fingerprint: review.fingerprint,
        status: review.status,
      }))
    : [];

  const pendingRunId = makeId("run");
  const analysis = analyzeDrift(pendingRunId, latestSnapshot.snapshot, pr, {
    issues: previousIssues,
    reviews: previousReviews,
    runId: previousRun?.id,
  });

  const inheritedReviews = buildInheritedReviews(
    previousRun?.id,
    analysis.carriedStatuses.map((review) => review.fingerprint),
  );

  const run = createAuditRun(
    {
      projectId,
      referenceSnapshotId: latestSnapshot.id,
      prNumber,
      prTitle: pr.title,
      commitSha: pr.headSha,
      sourcePrUrl: pr.url,
      sourcePrUpdatedAt: pr.updatedAt,
      prSelectionMode,
      status: "completed",
      summary: analysis.summary,
      comparison: analysis.comparison,
    },
    analysis.issues.map((issue) => ({ ...issue, auditRunId: pendingRunId })),
    inheritedReviews,
  );

  revalidatePath(`/projects/${projectId}`);
  redirect(`/audits/${run.id}`);
}

export async function checkLatestPullRequestAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  try {
    const latestOpenPr = await fetchLatestOpenPullRequest(
      details.project.repoOwner,
      details.project.repoName,
    );

    if (!latestOpenPr) {
      projectMessageRedirect(
        projectId,
        "error",
        "No open PRs found. Choose a PR manually to keep going.",
      );
    }

    await runAuditForPullRequest(projectId, latestOpenPr.number, "auto-latest");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not check the latest pull request.";
    projectMessageRedirect(projectId, "error", message);
  }
}

export async function runAuditForSelectedPullRequestAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const prNumber = Number(formData.get("prNumber"));

  try {
    await runAuditForPullRequest(projectId, prNumber, "manual");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run the selected PR.";
    projectMessageRedirect(projectId, "error", message);
  }
}

export async function runAuditAction(formData: FormData) {
  return runAuditForSelectedPullRequestAction(formData);
}

export async function reviewIssueAction(formData: FormData) {
  const auditRunId = String(formData.get("auditRunId"));
  const fingerprint = String(formData.get("fingerprint"));
  const status = String(formData.get("status")) as ReviewStatus;

  upsertIssueReview(auditRunId, fingerprint, status);
  const auditRun = getAuditRun(auditRunId);

  revalidatePath(`/audits/${auditRunId}`);
  if (auditRun) {
    revalidatePath(`/projects/${auditRun.projectId}`);
  }
}
