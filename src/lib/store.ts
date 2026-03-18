import { db } from "@/lib/db";
import type {
  AuditRun,
  DriftIssue,
  IssueReview,
  Project,
  ProjectDetails,
  ReferenceSnapshot,
  ReferenceSnapshotRecord,
  ReviewStatus,
} from "@/lib/types";
import { makeId } from "@/lib/utils";

function parseJson<T>(value: string | null): T | null {
  return value ? (JSON.parse(value) as T) : null;
}

function buildDerivedUrls(project: {
  repo_owner: string;
  repo_name: string;
  figma_file_key: string;
  repo_url?: string | null;
  figma_url?: string | null;
}) {
  return {
    repoUrl:
      project.repo_url ?? `https://github.com/${project.repo_owner}/${project.repo_name}`,
    figmaUrl: project.figma_url ?? `https://www.figma.com/design/${project.figma_file_key}`,
  };
}

export function listProjects(): Project[] {
  const rows = db
    .prepare(
      `SELECT id, name, figma_url, repo_url, repo_owner, repo_name, figma_file_key, created_at, updated_at
       FROM projects
       ORDER BY updated_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    figma_url: string | null;
    repo_url: string | null;
    repo_owner: string;
    repo_name: string;
    figma_file_key: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ...buildDerivedUrls(row),
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    figmaFileKey: row.figma_file_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function createProject(input: Omit<Project, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const project: Project = {
    id: makeId("proj"),
    createdAt: now,
    updatedAt: now,
    ...input,
  };

  db.prepare(
    `INSERT INTO projects (id, name, figma_url, repo_url, repo_owner, repo_name, figma_file_key, created_at, updated_at)
     VALUES (@id, @name, @figmaUrl, @repoUrl, @repoOwner, @repoName, @figmaFileKey, @createdAt, @updatedAt)`,
  ).run(project);

  return project;
}

export function updateProject(
  projectId: string,
  input: Pick<Project, "repoOwner" | "repoName" | "figmaFileKey" | "figmaUrl" | "repoUrl">,
) {
  db.prepare(
    `UPDATE projects
     SET figma_url = @figmaUrl, repo_url = @repoUrl, repo_owner = @repoOwner, repo_name = @repoName, figma_file_key = @figmaFileKey, updated_at = @updatedAt
     WHERE id = @projectId`,
  ).run({
    projectId,
    updatedAt: new Date().toISOString(),
    ...input,
  });
}

export function getProjectDetails(projectId: string): ProjectDetails | null {
  const project = listProjects().find((item) => item.id === projectId);

  if (!project) {
    return null;
  }

  return {
    project,
    latestSnapshot: getLatestSnapshot(projectId),
    auditRuns: listAuditRuns(projectId),
  };
}

export function createReferenceSnapshot(
  projectId: string,
  snapshot: ReferenceSnapshot,
): ReferenceSnapshotRecord {
  const now = new Date().toISOString();
  const record: ReferenceSnapshotRecord = {
    id: makeId("snap"),
    projectId,
    versionLabel: snapshot.metadata.versionLabel,
    sourceType: snapshot.metadata.source,
    snapshot,
    createdAt: now,
  };

  db.prepare(
    `INSERT INTO reference_snapshots (id, project_id, version_label, source_type, snapshot_json, created_at)
     VALUES (@id, @projectId, @versionLabel, @sourceType, @snapshotJson, @createdAt)`,
  ).run({
    ...record,
    snapshotJson: JSON.stringify(snapshot),
  });

  db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(now, projectId);
  return record;
}

export function getLatestSnapshot(projectId: string): ReferenceSnapshotRecord | null {
  const row = db
    .prepare(
      `SELECT id, project_id, version_label, source_type, snapshot_json, created_at
       FROM reference_snapshots
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(projectId) as
    | {
        id: string;
        project_id: string;
        version_label: string;
        source_type: string;
        snapshot_json: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    versionLabel: row.version_label,
    sourceType: row.source_type,
    snapshot: JSON.parse(row.snapshot_json) as ReferenceSnapshot,
    createdAt: row.created_at,
  };
}

export function listAuditRuns(projectId: string): AuditRun[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, reference_snapshot_id, pr_number, pr_title, commit_sha, source_pr_url, source_pr_updated_at, pr_selection_mode, status, summary_json, comparison_json, created_at
       FROM audit_runs
       WHERE project_id = ?
       ORDER BY created_at DESC`,
    )
    .all(projectId) as Array<{
    id: string;
    project_id: string;
    reference_snapshot_id: string;
    pr_number: number;
    pr_title: string;
    commit_sha: string;
    source_pr_url: string | null;
    source_pr_updated_at: string | null;
    pr_selection_mode: "auto-latest" | "manual" | null;
    status: "completed" | "failed";
    summary_json: string;
    comparison_json: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    referenceSnapshotId: row.reference_snapshot_id,
    prNumber: row.pr_number,
    prTitle: row.pr_title,
    commitSha: row.commit_sha,
    sourcePrUrl: row.source_pr_url ?? undefined,
    sourcePrUpdatedAt: row.source_pr_updated_at ?? undefined,
    prSelectionMode: row.pr_selection_mode ?? undefined,
    status: row.status,
    summary: JSON.parse(row.summary_json) as AuditRun["summary"],
    comparison: parseJson<AuditRun["comparison"]>(row.comparison_json) ?? undefined,
    createdAt: row.created_at,
  }));
}

export function getAuditRun(auditRunId: string) {
  return listAllAuditRuns().find((item) => item.id === auditRunId) ?? null;
}

function listAllAuditRuns() {
  const rows = db
    .prepare(
      `SELECT id, project_id, reference_snapshot_id, pr_number, pr_title, commit_sha, source_pr_url, source_pr_updated_at, pr_selection_mode, status, summary_json, comparison_json, created_at
       FROM audit_runs
       ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string;
    project_id: string;
    reference_snapshot_id: string;
    pr_number: number;
    pr_title: string;
    commit_sha: string;
    source_pr_url: string | null;
    source_pr_updated_at: string | null;
    pr_selection_mode: "auto-latest" | "manual" | null;
    status: "completed" | "failed";
    summary_json: string;
    comparison_json: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    referenceSnapshotId: row.reference_snapshot_id,
    prNumber: row.pr_number,
    prTitle: row.pr_title,
    commitSha: row.commit_sha,
    sourcePrUrl: row.source_pr_url ?? undefined,
    sourcePrUpdatedAt: row.source_pr_updated_at ?? undefined,
    prSelectionMode: row.pr_selection_mode ?? undefined,
    status: row.status,
    summary: JSON.parse(row.summary_json) as AuditRun["summary"],
    comparison: parseJson<AuditRun["comparison"]>(row.comparison_json) ?? undefined,
    createdAt: row.created_at,
  }));
}

export function createAuditRun(
  input: Omit<AuditRun, "id" | "createdAt">,
  issues: DriftIssue[],
  inheritedReviews: IssueReview[],
) {
  const auditRun: AuditRun = {
    id: makeId("run"),
    createdAt: new Date().toISOString(),
    ...input,
  };

  const insertAudit = db.prepare(
    `INSERT INTO audit_runs (id, project_id, reference_snapshot_id, pr_number, pr_title, commit_sha, source_pr_url, source_pr_updated_at, pr_selection_mode, status, summary_json, comparison_json, created_at)
     VALUES (@id, @projectId, @referenceSnapshotId, @prNumber, @prTitle, @commitSha, @sourcePrUrl, @sourcePrUpdatedAt, @prSelectionMode, @status, @summaryJson, @comparisonJson, @createdAt)`,
  );

  const insertIssue = db.prepare(
    `INSERT INTO drift_issues (
      id, audit_run_id, fingerprint, component_name, issue_type, severity, confidence, expected, found, file_path, evidence_snippet, suggested_action
     ) VALUES (
      @id, @auditRunId, @fingerprint, @componentName, @issueType, @severity, @confidence, @expected, @found, @filePath, @evidenceSnippet, @suggestedAction
     )`,
  );

  const insertReview = db.prepare(
    `INSERT INTO issue_reviews (id, audit_run_id, fingerprint, status, note, created_at, updated_at)
     VALUES (@id, @auditRunId, @fingerprint, @status, @note, @createdAt, @updatedAt)`,
  );

  const tx = db.transaction(() => {
    insertAudit.run({
      ...auditRun,
      summaryJson: JSON.stringify(auditRun.summary),
      comparisonJson: auditRun.comparison ? JSON.stringify(auditRun.comparison) : null,
    });

    for (const issue of issues) {
      insertIssue.run({ ...issue, auditRunId: auditRun.id });
    }

    for (const review of inheritedReviews) {
      insertReview.run({ ...review, auditRunId: auditRun.id });
    }
  });

  tx();
  db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).run(auditRun.createdAt, auditRun.projectId);

  return auditRun;
}

export function listIssuesForAuditRun(auditRunId: string): DriftIssue[] {
  const rows = db
    .prepare(
      `SELECT id, audit_run_id, fingerprint, component_name, issue_type, severity, confidence, expected, found, file_path, evidence_snippet, suggested_action
       FROM drift_issues
       WHERE audit_run_id = ?
       ORDER BY severity = 'high' DESC, severity = 'medium' DESC, component_name ASC`,
    )
    .all(auditRunId) as Array<{
    id: string;
    audit_run_id: string;
    fingerprint: string;
    component_name: string;
    issue_type: DriftIssue["issueType"];
    severity: DriftIssue["severity"];
    confidence: number;
    expected: string;
    found: string;
    file_path: string;
    evidence_snippet: string;
    suggested_action: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    auditRunId: row.audit_run_id,
    fingerprint: row.fingerprint,
    componentName: row.component_name,
    issueType: row.issue_type,
    severity: row.severity,
    confidence: row.confidence,
    expected: row.expected,
    found: row.found,
    filePath: row.file_path,
    evidenceSnippet: row.evidence_snippet,
    suggestedAction: row.suggested_action,
  }));
}

export function listReviewsForAuditRun(auditRunId: string): IssueReview[] {
  const rows = db
    .prepare(
      `SELECT id, audit_run_id, fingerprint, status, note, created_at, updated_at
       FROM issue_reviews
       WHERE audit_run_id = ?`,
    )
    .all(auditRunId) as Array<{
    id: string;
    audit_run_id: string;
    fingerprint: string;
    status: ReviewStatus;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    auditRunId: row.audit_run_id,
    fingerprint: row.fingerprint,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function upsertIssueReview(
  auditRunId: string,
  fingerprint: string,
  status: ReviewStatus,
  note?: string,
) {
  const existing = db
    .prepare(`SELECT id FROM issue_reviews WHERE audit_run_id = ? AND fingerprint = ?`)
    .get(auditRunId, fingerprint) as { id: string } | undefined;
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(
      `UPDATE issue_reviews
       SET status = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    ).run(status, note ?? null, now, existing.id);
    return existing.id;
  }

  const id = makeId("rev");
  db.prepare(
    `INSERT INTO issue_reviews (id, audit_run_id, fingerprint, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, auditRunId, fingerprint, status, note ?? null, now, now);
  return id;
}

export function buildInheritedReviews(previousRunId: string | undefined, fingerprints: string[]) {
  if (!previousRunId) {
    return [];
  }

  const previous = listReviewsForAuditRun(previousRunId);
  const now = new Date().toISOString();

  return previous
    .filter((review) => fingerprints.includes(review.fingerprint))
    .map((review) => ({
      ...review,
      id: makeId("rev"),
      createdAt: now,
      updatedAt: now,
    }));
}
