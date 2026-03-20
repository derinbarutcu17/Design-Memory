import { listProjects } from "@/lib/store";
import {
  postAuditResultToGitHub,
  runAuditForProject,
  runLatestAuditForProject,
  syncProjectReference,
} from "@/lib/runner";

function printUsage() {
  console.log(`Design Memory CLI

Usage:
  design-memory projects
  design-memory sync --project <projectId>
  design-memory run --project <projectId> [--pr <number> | --latest] [--post] [--json]

Examples:
  npm run cli -- projects
  npm run cli -- sync --project proj_123
  npm run cli -- run --project proj_123 --latest --post
  npm run cli -- run --project proj_123 --pr 42 --json
`);
}

type CliArgs = {
  _: string[];
  project?: string;
  pr?: number;
  latest?: boolean;
  post?: boolean;
  json?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === "--project") {
      args.project = argv[++i];
    } else if (token === "--pr") {
      const raw = argv[++i];
      args.pr = raw ? Number(raw) : undefined;
    } else if (token === "--latest") {
      args.latest = true;
    } else if (token === "--post") {
      args.post = true;
    } else if (token === "--json") {
      args.json = true;
    } else if (token === "-h" || token === "--help") {
      args._.push("help");
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || command.startsWith("-") || args._.includes("help")) {
    printUsage();
    return;
  }

  if (command === "projects") {
    const projects = listProjects();
    const payload = projects.map((project) => ({
      id: project.id,
      name: project.name,
      repo: `${project.repoOwner}/${project.repoName}`,
      figmaFileKey: project.figmaFileKey,
      updatedAt: project.updatedAt,
    }));
    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      for (const project of payload) {
        console.log(`${project.id}\t${project.name}\t${project.repo}\t${project.figmaFileKey}`);
      }
    }
    return;
  }

  if (!args.project) {
    throw new Error("Missing --project <projectId>.");
  }

  if (command === "sync") {
    const snapshot = await syncProjectReference(args.project);
    const payload = {
      projectId: args.project,
      snapshotId: snapshot.id,
      sourceType: snapshot.sourceType,
      versionLabel: snapshot.versionLabel,
      componentCount: snapshot.snapshot.metadata.componentCount,
      tokenCount: snapshot.snapshot.metadata.tokenCount,
    };
    console.log(args.json ? JSON.stringify(payload, null, 2) : `Synced ${payload.componentCount ?? 0} components from ${payload.sourceType}.`);
    return;
  }

  if (command === "run") {
    if (args.pr && args.latest) {
      throw new Error("Use either --pr <number> or --latest, not both.");
    }

    if (!args.latest && !args.pr) {
      throw new Error("Provide --pr <number> or --latest.");
    }

    const result = args.latest
      ? await runLatestAuditForProject(args.project)
      : await runAuditForProject(args.project, args.pr as number, "manual");

    if (args.post) {
      await postAuditResultToGitHub(args.project, result.run.id);
    }

    const payload = {
      projectId: args.project,
      auditRunId: result.run.id,
      prNumber: result.run.prNumber,
      prTitle: result.run.prTitle,
      referenceSyncMode: result.referenceSyncMode,
      sourceType: result.snapshotRecord.sourceType,
      totalIssues: result.run.summary.totalIssues,
      high: result.run.summary.high,
      medium: result.run.summary.medium,
      low: result.run.summary.low,
      comparison: result.run.comparison,
      fixBrief: result.fixBrief,
      checkSummary: result.checkSummary,
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`Audit run ${payload.auditRunId}`);
      console.log(`PR #${payload.prNumber}: ${payload.prTitle}`);
      console.log(`Issues: ${payload.totalIssues} (high ${payload.high}, medium ${payload.medium}, low ${payload.low})`);
      console.log(`Reference: ${payload.sourceType} / ${payload.referenceSyncMode}`);
      if (payload.comparison) {
        console.log(
          `Comparison: resolved ${payload.comparison.resolvedFingerprints.length}, remaining ${payload.comparison.remainingFingerprints.length}, new ${payload.comparison.newFingerprints.length}`,
        );
      }
      console.log(`\nFix brief:\n${result.fixBrief}`);
      console.log(`\nCheck summary:\n${result.checkSummary}`);
      if (args.post) {
        console.log(`\nPosted to GitHub.`);
      }
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
