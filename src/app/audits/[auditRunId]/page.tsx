import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewIssueAction } from "@/app/actions";
import { generateFixBrief } from "@/lib/audit";
import { CopyButton } from "@/components/copy-button";
import { Pill, Stat, Surface } from "@/components/ui";
import {
  getAuditRun,
  getProjectDetails,
  listIssuesForAuditRun,
  listReviewsForAuditRun,
} from "@/lib/store";
import type { PullRequestDetails, ReviewStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function mapReviewTone(status?: ReviewStatus) {
  if (!status) {
    return "default";
  }

  return status;
}

export default async function AuditRunPage({
  params,
}: {
  params: Promise<{ auditRunId: string }>;
}) {
  const { auditRunId } = await params;
  const auditRun = getAuditRun(auditRunId);

  if (!auditRun) {
    notFound();
  }

  const projectDetails = getProjectDetails(auditRun.projectId);

  if (!projectDetails) {
    notFound();
  }

  const issues = listIssuesForAuditRun(auditRun.id);
  const reviews = listReviewsForAuditRun(auditRun.id);
  const reviewMap = new Map(reviews.map((review) => [review.fingerprint, review.status]));

  const groupedIssues = issues.reduce<Record<string, typeof issues>>((acc, issue) => {
    acc[issue.componentName] ??= [];
    acc[issue.componentName].push(issue);
    return acc;
  }, {});

  const pseudoPr: PullRequestDetails = {
    number: auditRun.prNumber,
    title: auditRun.prTitle,
    headSha: auditRun.commitSha,
    url: `https://github.com/${projectDetails.project.repoOwner}/${projectDetails.project.repoName}/pull/${auditRun.prNumber}`,
    files: [],
  };
  const fixBrief = generateFixBrief(pseudoPr, issues, reviewMap);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#041019,_#020617)] px-6 py-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-sky-200/70">
              Audit review
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              PR #{auditRun.prNumber} · {auditRun.prTitle}
            </h1>
            <p className="mt-3 text-slate-300">
              {projectDetails.project.name} · {formatDate(auditRun.createdAt)} ·{" "}
              {auditRun.prSelectionMode === "auto-latest"
                ? "auto-selected latest PR"
                : "manually chosen PR"}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/projects/${projectDetails.project.id}`}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
            >
              Project
            </Link>
            <Link
              href={`/audits/${auditRun.id}/compare`}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100"
            >
              Comparison
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Total issues" value={auditRun.summary.totalIssues} />
          <Stat label="High severity" value={auditRun.summary.high} />
          <Stat label="Medium severity" value={auditRun.summary.medium} />
          <Stat label="Low severity" value={auditRun.summary.low} />
        </div>

        <Surface>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last synced from Figma</p>
              <p className="mt-2 text-sm text-slate-200">
                {projectDetails.latestSnapshot
                  ? formatDate(projectDetails.latestSnapshot.createdAt)
                  : "No snapshot"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Last checked PR</p>
              <p className="mt-2 text-sm text-slate-200">
                {auditRun.sourcePrUrl ? (
                  <a href={auditRun.sourcePrUrl} className="underline decoration-white/20 underline-offset-4">
                    {auditRun.sourcePrUrl}
                  </a>
                ) : (
                  `#${auditRun.prNumber}`
                )}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">PR updated</p>
              <p className="mt-2 text-sm text-slate-200">
                {auditRun.sourcePrUpdatedAt ? formatDate(auditRun.sourcePrUpdatedAt) : "Unknown"}
              </p>
            </div>
          </div>
        </Surface>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Surface>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  Fix brief
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Agent-ready task spec
                </h2>
              </div>
              <CopyButton value={fixBrief} />
            </div>
            <textarea
              readOnly
              value={fixBrief}
              className="mt-6 min-h-[480px] w-full rounded-[28px] border border-white/10 bg-[#020817] px-4 py-4 font-mono text-sm text-slate-200 outline-none"
            />
          </Surface>

          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Drift evidence
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Expected vs found implementation mismatches
            </h2>
            <div className="mt-6 space-y-6">
              {issues.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-white/10 p-5 text-slate-300">
                  No drift issues were detected in the supported React/Tailwind surface.
                </p>
              ) : null}
              {Object.entries(groupedIssues).map(([componentName, componentIssues]) => (
                <div
                  key={componentName}
                  className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Component
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-white">{componentName}</h3>
                    </div>
                    <Pill>{componentIssues.length} issue(s)</Pill>
                  </div>

                  <div className="mt-5 space-y-4">
                    {componentIssues.map((issue) => {
                      const reviewStatus = reviewMap.get(issue.fingerprint);
                      return (
                        <div
                          key={issue.id}
                          className="rounded-3xl border border-white/8 bg-[#030d19] p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Pill tone={issue.severity}>{issue.severity}</Pill>
                              <Pill tone={mapReviewTone(reviewStatus)}>
                                {reviewStatus ?? "pending"}
                              </Pill>
                              <span className="text-sm text-slate-400">
                                {issue.issueType}
                              </span>
                            </div>
                            <span className="text-sm text-slate-500">
                              {(issue.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                          <p className="mt-4 text-sm text-slate-400">File</p>
                          <p className="mt-1 font-mono text-sm text-slate-200">
                            {issue.filePath}
                          </p>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="text-sm text-slate-400">Expected</p>
                              <p className="mt-1 text-sm leading-7 text-slate-100">
                                {issue.expected}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-400">Found</p>
                              <p className="mt-1 text-sm leading-7 text-slate-100">
                                {issue.found}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                            <p className="text-sm text-slate-400">Evidence snippet</p>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-slate-200">
                              {issue.evidenceSnippet}
                            </pre>
                          </div>
                          <p className="mt-4 text-sm text-slate-300">
                            Suggested action: {issue.suggestedAction}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {(["valid", "intentional", "ignore"] as ReviewStatus[]).map((status) => (
                              <form key={status} action={reviewIssueAction}>
                                <input type="hidden" name="auditRunId" value={auditRun.id} />
                                <input
                                  type="hidden"
                                  name="fingerprint"
                                  value={issue.fingerprint}
                                />
                                <input type="hidden" name="status" value={status} />
                                <button
                                  type="submit"
                                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/5"
                                >
                                  Mark {status}
                                </button>
                              </form>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </main>
  );
}
