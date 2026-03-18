"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { analyzeDrift } from "@/lib/audit";
import { syncReferenceSnapshotFromFigma } from "@/lib/figma/normalize-reference";
import { fetchPullRequest } from "@/lib/github";
import { createProjectSchema, referenceSnapshotSchema } from "@/lib/schema";
import { sampleReferenceSnapshot } from "@/lib/sample-reference";
import {
  buildInheritedReviews,
  createAuditRun,
  createProject,
  createReferenceSnapshot,
  getAuditRun,
  getLatestSnapshot,
  getProjectDetails,
  listAuditRuns,
  listIssuesForAuditRun,
  listReviewsForAuditRun,
  upsertIssueReview,
  updateProject,
} from "@/lib/store";
import type { ReviewStatus } from "@/lib/types";
import { makeId } from "@/lib/utils";

function projectMessageRedirect(projectId: string, status: "success" | "error", message: string) {
  const query = new URLSearchParams({ status, message });
  redirect(`/projects/${projectId}?${query.toString()}`);
}

export async function createProjectAction(formData: FormData) {
  const parsed = createProjectSchema.parse({
    name: formData.get("name"),
    repoOwner: formData.get("repoOwner"),
    repoName: formData.get("repoName"),
    figmaFileKey: formData.get("figmaFileKey"),
  });

  const project = createProject(parsed);
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const parsed = createProjectSchema.omit({ name: true }).parse({
    repoOwner: formData.get("repoOwner"),
    repoName: formData.get("repoName"),
    figmaFileKey: formData.get("figmaFileKey"),
  });

  updateProject(projectId, parsed);
  revalidatePath(`/projects/${projectId}`);
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

export async function runAuditAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const prNumber = Number(formData.get("prNumber"));
  const details = getProjectDetails(projectId);

  if (!details) {
    throw new Error("Project not found.");
  }

  const latestSnapshot = getLatestSnapshot(projectId);

  if (!latestSnapshot) {
    throw new Error("Import a Figma reference before running an audit.");
  }

  const pr = await fetchPullRequest(details.project.repoOwner, details.project.repoName, prNumber);
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
