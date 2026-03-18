import Link from "next/link";

import { createProjectAction } from "@/app/actions";
import { Surface, Stat } from "@/components/ui";
import { listAuditRuns, listProjects } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; message?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const projects = listProjects();
  const auditRuns = projects.flatMap((project) =>
    listAuditRuns(project.id).slice(0, 2).map((run) => ({ project, run })),
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_30%),linear-gradient(180deg,_#08111f,_#020617)] px-6 py-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        {resolvedSearchParams?.message ? (
          <div
            className={`rounded-3xl border px-5 py-4 text-sm ${
              resolvedSearchParams.status === "error"
                ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {resolvedSearchParams.message}
          </div>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Surface className="overflow-hidden">
            <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">
              Design Memory
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Review design-to-code drift before it becomes a painful handoff loop.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Figma stays the source of truth. GitHub PRs represent the implementation
              state. This V1 catches deterministic drift, routes it through a human
              review console, and exports a fix brief for the coding agent.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Stat label="Projects" value={projects.length} />
              <Stat label="Audit Runs" value={auditRuns.length} />
              <Stat label="Workflow" value="Human-in-loop" />
            </div>
          </Surface>

          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Create project
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Connect Figma and repo once
            </h2>

            <form action={createProjectAction} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Project name</span>
                <input
                  name="name"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60"
                  placeholder="Design Memory Demo"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Figma URL</span>
                <input
                  name="figmaUrl"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60"
                  placeholder="https://www.figma.com/design/..."
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">GitHub repo URL</span>
                <input
                  name="repoUrl"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-sky-400/60"
                  placeholder="https://github.com/owner/repo"
                />
              </label>
              <button
                type="submit"
                className="w-full rounded-full bg-sky-500 px-5 py-3 font-medium text-slate-950 transition hover:bg-sky-400"
              >
                Create project
              </button>
            </form>
          </Surface>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Projects</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Active design-memory workspaces
            </h2>
            <div className="mt-6 space-y-4">
              {projects.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-white/10 p-5 text-slate-300">
                  No projects yet. Create one to import a Figma reference and run your
                  first PR audit.
                </p>
              ) : null}
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block rounded-3xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-sky-300/30 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-medium text-white">{project.name}</h3>
                      <p className="mt-2 text-sm text-slate-300">
                        {project.repoOwner}/{project.repoName}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Last checked via one-click review loop
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">
                      Open
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Surface>

          <Surface>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Recent audits
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Latest implementation drift runs
            </h2>
            <div className="mt-6 space-y-4">
              {auditRuns.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-white/10 p-5 text-slate-300">
                  Audit runs will appear here after the first GitHub PR analysis.
                </p>
              ) : null}
              {auditRuns.map(({ project, run }) => (
                <Link
                  key={run.id}
                  href={`/audits/${run.id}`}
                  className="block rounded-3xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-sky-300/30 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                        {project.name}
                      </p>
                      <h3 className="mt-2 text-lg font-medium text-white">
                        {run.prSelectionMode === "auto-latest" ? "Latest PR" : "Manual PR"} · #
                        {run.prNumber} · {run.prTitle}
                      </h3>
                      <p className="mt-2 text-sm text-slate-300">
                        {run.summary.totalIssues} issues · {run.summary.high} high ·{" "}
                        {run.summary.medium} medium · {run.summary.low} low
                      </p>
                    </div>
                    <p className="text-sm text-slate-500">{formatDate(run.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </main>
  );
}
