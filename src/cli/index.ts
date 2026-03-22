#!/usr/bin/env node
import { Command } from 'commander';
import { compareRuns, loadLatestRunJson, reviewFinding, runAudit, scanPullRequest } from '../lib/audit';
import { syncReference } from '../lib/reference';
import { installHook } from './install';
import { ghostConfig } from './ghost';
import { prettyJson } from '../lib/utils';

export const program = new Command();

function resolveCwd(cwd?: string) {
  return cwd ? cwd : process.cwd();
}

program
  .name('design-memory')
  .description('Blocks net-new design policy violations and reference mismatches in React/Tailwind PRs with deterministic checks first.')
  .version('0.1.0');

export const auditCommand = program
  .command('audit')
  .description('Audit staged UI changes against the synced reference snapshot')
  .option('--cwd <path>', 'Repository path to audit')
  .option('--create-baseline', 'Create a baseline from the current findings')
  .option('--json', 'Print machine-readable JSON output')
  .action(async ({ cwd, createBaseline, json }: { cwd?: string; createBaseline?: boolean; json?: boolean }) => {
    try {
      await runAudit({}, { cwd: resolveCwd(cwd), createBaseline, json });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const initCommand = program
  .command('init')
  .description('Install the pre-commit hook and write the default config')
  .option('--cwd <path>', 'Repository path to initialize')
  .action(async ({ cwd }: { cwd?: string }) => {
    try {
      const previous = process.cwd();
      process.chdir(resolveCwd(cwd));
      try {
        await installHook();
      } finally {
        process.chdir(previous);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const syncReferenceCommand = program
  .command('sync-reference')
  .description('Normalize the configured design source into a canonical reference snapshot')
  .option('--cwd <path>', 'Repository path to sync')
  .action(async ({ cwd }: { cwd?: string }) => {
    try {
      const result = await syncReference(resolveCwd(cwd));
      console.log(`[Design Memory] Reference synced from ${result.snapshot.metadata.source}.`);
      console.log(`[Design Memory] Tokens: ${result.snapshot.metadata.tokenCount ?? result.snapshot.tokens.length}`);
      console.log(`[Design Memory] Components: ${result.snapshot.metadata.componentCount ?? result.snapshot.components.length}`);
      console.log(`[Design Memory] Output: ${result.outputPath}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const ghostCommand = program
  .command('ghost')
  .description('Optional helper: inject Design Memory guidance into IDE rules files')
  .option('--cwd <path>', 'Repository path to update')
  .action(async ({ cwd }: { cwd?: string }) => {
    try {
      const previous = process.cwd();
      process.chdir(resolveCwd(cwd));
      try {
        await ghostConfig();
      } finally {
        process.chdir(previous);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const scanCommand = program
  .command('scan')
  .description('Run a non-blocking PR audit against a GitHub pull request')
  .option('--cwd <path>', 'Repository path to scan')
  .requiredOption('--pr <number>', 'Pull request number to scan')
  .option('--json', 'Print machine-readable JSON output')
  .action(async ({ cwd, pr, json }: { cwd?: string; pr: string; json?: boolean }) => {
    try {
      await scanPullRequest(Number(pr), resolveCwd(cwd), { json });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const reviewCommand = program
  .command('review')
  .description('List or update review decisions for the latest run')
  .option('--cwd <path>', 'Repository path to inspect')
  .option('--fingerprint <value>', 'Finding fingerprint to review')
  .option('--status <value>', 'Review status: intentional or ignore')
  .option('--note <value>', 'Optional note for the review decision')
  .option('--json', 'Print machine-readable JSON output')
  .action(async ({ cwd, fingerprint, status, note, json }: { cwd?: string; fingerprint?: string; status?: 'intentional' | 'ignore'; note?: string; json?: boolean }) => {
    try {
      if (fingerprint && status) {
        const review = reviewFinding(fingerprint, status, note, resolveCwd(cwd));
        console.log(json ? prettyJson(review) : `[Design Memory] Stored ${status} review for ${fingerprint}.`);
        return;
      }

      const latest = loadLatestRunJson(resolveCwd(cwd));
      console.log(json ? prettyJson(latest.issues) : latest.issues.map((issue) => `${issue.fingerprint} ${issue.status} ${issue.filePath} ${issue.ruleId}`).join('\n'));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

export const compareCommand = program
  .command('compare')
  .description('Compare the latest run against the previous run/baseline')
  .option('--cwd <path>', 'Repository path to inspect')
  .option('--json', 'Print machine-readable JSON output')
  .action(async ({ cwd, json }: { cwd?: string; json?: boolean }) => {
    try {
      const comparison = compareRuns(resolveCwd(cwd));
      console.log(json ? prettyJson(comparison) : prettyJson(comparison));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse(process.argv);
