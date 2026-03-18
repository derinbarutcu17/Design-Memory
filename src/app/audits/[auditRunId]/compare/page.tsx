import Link from "next/link";
import { notFound } from "next/navigation";

import { Stat, Surface } from "@/components/ui";
import { getAuditRun, listIssuesForAuditRun } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AuditComparePage({
  params,
}: {
  params: Promise<{ auditRunId: string }>;
}) {
  const { auditRunId } = await params;
  const auditRun = getAuditRun(auditRunId);

  if (!auditRun) {
    notFound();
  }

  const issues = listIssuesForAuditRun(auditRun.id);
  const comparison = auditRun.comparison;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#03101a,_#020617)] px-6 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-sky-200/70">
              Audit comparison
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">
              PR #{auditRun.prNumber} comparison
            </h1>
            <p className="mt-3 text-slate-300">
              {auditRun.prSelectionMode === "auto-latest"
                ? "Latest PR auto-check"
                : "Manual PR selection"}
            </p>
          </div>
          <Link
            href={`/audits/${auditRun.id}`}
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
          >
            Back to review
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Current issues" value={issues.length} />
          <Stat label="Resolved vs prior" value={comparison?.resolvedFingerprints.length ?? 0} />
          <Stat label="Remaining vs prior" value={comparison?.remainingFingerprints.length ?? 0} />
          <Stat label="New vs prior" value={comparison?.newFingerprints.length ?? 0} />
        </div>

        <Surface>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
            Rerun summary
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Fingerprint-based before/after drift comparison
          </h2>
          {comparison?.baselineRunId ? (
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-emerald-100/80">
                  Resolved
                </p>
                <ul className="mt-4 space-y-2 font-mono text-xs text-emerald-50">
                  {comparison.resolvedFingerprints.length === 0 ? (
                    <li>No resolved fingerprints yet.</li>
                  ) : (
                    comparison.resolvedFingerprints.map((fingerprint) => (
                      <li key={fingerprint}>{fingerprint}</li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-amber-100/80">
                  Remaining
                </p>
                <ul className="mt-4 space-y-2 font-mono text-xs text-amber-50">
                  {comparison.remainingFingerprints.length === 0 ? (
                    <li>No remaining fingerprints.</li>
                  ) : (
                    comparison.remainingFingerprints.map((fingerprint) => (
                      <li key={fingerprint}>{fingerprint}</li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-sky-100/80">
                  New
                </p>
                <ul className="mt-4 space-y-2 font-mono text-xs text-sky-50">
                  {comparison.newFingerprints.length === 0 ? (
                    <li>No new fingerprints in this run.</li>
                  ) : (
                    comparison.newFingerprints.map((fingerprint) => (
                      <li key={fingerprint}>{fingerprint}</li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-3xl border border-dashed border-white/10 p-5 text-slate-300">
              This is the first audit run for the project, so there is no baseline run to
              compare against yet.
            </p>
          )}
        </Surface>
      </div>
    </main>
  );
}
