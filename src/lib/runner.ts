import { analyzeDrift, generateCheckSummary, generateFixBrief } from "@/lib/audit";
import { FigmaSyncError } from "@/lib/figma/client";
import { syncReferenceSnapshotFromFigma } from "@/lib/figma/normalize-reference";
import {
  fetchLatestOpenPullRequest,
  fetchPullRequest,
  postPullRequestComment,
} from "@/lib/github";
import {
  buildInheritedReviews,
  createAuditRun,
  createReferenceSnapshot,
  getLatestSnapshotBySourceType,
  getProjectDetails,
  listAuditRuns,
  listIssuesForAuditRun,
  listReviewsForAuditRun,
} from "@/lib/store";
import { makeId } from "@/lib/utils";
import type { AuditRun, PullRequestDetails, ReferenceSnapshotRecord, ReviewStatus } from "@/lib/types";

export type AuditWorkflowResult = {
  projectId: string;
  pr: PullRequestDetails;
  run: AuditRun;
  snapshotRecord: ReferenceSnapshotRecord;
  referenceSyncMode: "live" | "cached";
  fixBrief: string;
  checkSummary: string;
};

export async function syncProjectReference(projectId: string) {
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  const snapshot = await syncReferenceSnapshotFromFigma(details.project.figmaFileKey);
  return createReferenceSnapshot(projectId, snapshot);
}

export async function resolveAuditReferenceSnapshot(projectId: string, figmaFileKey: string) {
  try {
    const snapshot = await syncReferenceSnapshotFromFigma(figmaFileKey);
    return {
      snapshotRecord: createReferenceSnapshot(projectId, snapshot),
      referenceSyncMode: "live" as const,
    };
  } catch (error) {
    if (error instanceof FigmaSyncError && error.status === 429) {
      const cachedSnapshot = getLatestSnapshotBySourceType(projectId, "figma-api");
      if (cachedSnapshot) {
        return {
          snapshotRecord: cachedSnapshot,
          referenceSyncMode: "cached" as const,
        };
      }
    }

    throw error;
  }
}

async function buildAuditWorkflowResult(
  projectId: string,
  pr: PullRequestDetails,
  referenceSyncMode: "live" | "cached",
  snapshotRecord: ReferenceSnapshotRecord,
  prSelectionMode: "auto-latest" | "manual",
): Promise<AuditWorkflowResult> {
  const previousRun = listAuditRuns(projectId)[0];
  const previousIssues = previousRun ? listIssuesForAuditRun(previousRun.id) : [];
  const previousReviews = previousRun
    ? listReviewsForAuditRun(previousRun.id).map((review) => ({
        fingerprint: review.fingerprint,
        status: review.status,
      }))
    : [];

  const pendingRunId = makeId("run");
  const analysis = analyzeDrift(pendingRunId, snapshotRecord.snapshot, pr, {
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
      referenceSnapshotId: snapshotRecord.id,
      referenceSyncMode,
      referenceSnapshotSourceType: snapshotRecord.sourceType,
      prNumber: pr.number,
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

  const reviews = new Map(listReviewsForAuditRun(run.id).map((review) => [review.fingerprint, review.status] as const));
  const fixBrief = generateFixBrief(pr, listIssuesForAuditRun(run.id), reviews);
  const checkSummary = generateCheckSummary(pr, listIssuesForAuditRun(run.id), reviews);

  return {
    projectId,
    pr,
    run,
    snapshotRecord,
    referenceSyncMode,
    fixBrief,
    checkSummary,
  };
}

export async function runAuditForProject(
  projectId: string,
  prNumber: number,
  prSelectionMode: "auto-latest" | "manual",
): Promise<AuditWorkflowResult> {
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  const latestSnapshotResult = await resolveAuditReferenceSnapshot(
    projectId,
    details.project.figmaFileKey,
  );
  const pr = await fetchPullRequest(details.project.repoOwner, details.project.repoName, prNumber);

  if (pr.files.length === 0) {
    throw new Error("No UI-related changes found in that pull request.");
  }

  return buildAuditWorkflowResult(
    projectId,
    pr,
    latestSnapshotResult.referenceSyncMode,
    latestSnapshotResult.snapshotRecord,
    prSelectionMode,
  );
}

export async function runLatestAuditForProject(projectId: string) {
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  const latestOpenPr = await fetchLatestOpenPullRequest(
    details.project.repoOwner,
    details.project.repoName,
  );

  if (!latestOpenPr) {
    throw new Error("No open PRs found.");
  }

  return runAuditForProject(projectId, latestOpenPr.number, "auto-latest");
}

export async function postAuditResultToGitHub(projectId: string, auditRunId: string) {
  const details = getProjectDetails(projectId);
  if (!details) {
    throw new Error("Project not found.");
  }

  const auditRun = listAuditRuns(projectId).find((run) => run.id === auditRunId);
  if (!auditRun) {
    throw new Error("Audit run not found.");
  }

  const issues = listIssuesForAuditRun(auditRunId);
  const reviews = new Map(listReviewsForAuditRun(auditRunId).map((review) => [review.fingerprint, review.status]));
  const pr = {
    number: auditRun.prNumber,
    title: auditRun.prTitle,
    headSha: auditRun.commitSha,
    url:
      auditRun.sourcePrUrl ??
      `https://github.com/${details.project.repoOwner}/${details.project.repoName}/pull/${auditRun.prNumber}`,
    files: [],
  };

  const fixBrief = generateFixBrief(pr, issues, reviews);
  const checkSummary = generateCheckSummary(pr, issues, reviews);
  const commentBody = [
    `## Design Memory check`,
    ``,
    `Summary`,
    '```',
    checkSummary,
    '```',
    ``,
    `Fix brief`,
    '```',
    fixBrief,
    '```',
  ].join("\n");

  await postPullRequestComment(details.project.repoOwner, details.project.repoName, auditRun.prNumber, commentBody);
  return { fixBrief, checkSummary, commentBody };
}
