import { readFileSync } from 'node:fs';
import path from 'node:path';

import { filterAuditableFiles, getStagedDiff, getStagedFileContent, isAuditableCodeFile } from './git';
import { resolveReferenceSnapshot } from './context';
import { detectAvailableBrain, promptBrain } from './engine';
import { readConfig, type DesignMemoryConfig, type RuleId, type RuleSeverity } from './config';
import { getPullRequestScan, type PullRequestScan } from './github';
import { createBaseline, loadBaseline, loadLatestRun, loadReferenceSnapshot, loadReviews, loadRunHistory, makeRunId, saveAuditRun } from './state';
import type { AuditRun, DetectionSource, DriftIssue, ReferenceSnapshot } from './types';
import { hashParts, normalizeForMatch, prettyJson, toPascalCase, uniqueStrings } from './utils';

type AuditDependencies = {
  getDiff?: typeof getStagedDiff;
  getFileContent?: typeof getStagedFileContent;
  getSnapshot?: typeof loadReferenceSnapshot;
  resolveSnapshot?: typeof resolveReferenceSnapshot;
  getBrain?: typeof detectAvailableBrain;
  askBrain?: typeof promptBrain;
  exit?: typeof process.exit;
};

type AuditOptions = {
  cwd?: string;
  mode?: 'staged' | 'scan';
  diff?: string;
  label?: string;
  createBaseline?: boolean;
  json?: boolean;
  prScan?: PullRequestScan;
};

type FileDiff = {
  filePath: string;
  diff: string;
  addedLines: string[];
  fullContent?: string | null;
};

type Mapping = {
  filePath: string;
  componentName: string;
  confidence: number;
  detectionSource: DetectionSource;
  referenceIndex: number;
};

type LlmAuditResponse = {
  explanations?: Array<{
    fingerprint: string;
    suggestedAction?: string;
  }>;
};

function toIssueType(ruleId: RuleId): DriftIssue['issueType'] {
  if (ruleId.startsWith('component.variant')) return 'variant-drift';
  if (ruleId.startsWith('component.missing-state')) return 'missing-state';
  if (ruleId.startsWith('component.')) return 'component-reuse';
  if (ruleId.startsWith('token.')) return 'token-mismatch';
  return 'hardcoded-style';
}

function getIssueKey(issue: Pick<DriftIssue, 'ruleId' | 'componentName' | 'filePath' | 'expected'>) {
  return `${normalizeForMatch(issue.componentName)}::${issue.ruleId}::${issue.filePath}::${normalizeForMatch(issue.expected)}`;
}

function parseDiffIntoFiles(diff: string, config: DesignMemoryConfig, cwd = process.cwd()): FileDiff[] {
  return diff
    .split(/^FILE:\s+/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [header, ...rest] = block.split('\n');
      const filePath = header.trim();
      const body = rest.join('\n');
      const addedLines = body
        .split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1));

      return {
        filePath,
        diff: body,
        addedLines,
      };
    })
    .filter((file) => isAuditableCodeFile(file.filePath) && filterAuditableFiles([file.filePath], cwd).includes(file.filePath))
    .filter((file) => file.addedLines.length > 0);
}

function getFileStem(filePath: string) {
  return path.basename(filePath).replace(/\.[^.]+$/, '');
}

function matchComponents(snapshot: ReferenceSnapshot, files: FileDiff[]): Mapping[] {
  const mappings: Mapping[] = [];

  for (const file of files) {
    const stem = normalizeForMatch(getFileStem(file.filePath));
    const content = file.fullContent ?? file.addedLines.join('\n');
    const contentMatch = normalizeForMatch(content);

    snapshot.components.forEach((component, index) => {
      const candidates = uniqueStrings([
        component.name,
        ...(component.aliases ?? []),
        ...(component.codeMatches ?? []),
      ]);

      let confidence = 0;
      for (const candidate of candidates) {
        const normalized = normalizeForMatch(candidate);
        if (!normalized) continue;
        if (stem === normalized) {
          confidence = Math.max(confidence, 0.98);
        } else if (stem.includes(normalized) || normalized.includes(stem)) {
          confidence = Math.max(confidence, 0.86);
        } else if (contentMatch.includes(normalized)) {
          confidence = Math.max(confidence, 0.72);
        }
      }

      if (confidence >= 0.72) {
        mappings.push({
          filePath: file.filePath,
          componentName: component.name,
          confidence,
          detectionSource: 'deterministic',
          referenceIndex: index,
        });
      }
    });
  }

  return mappings.sort((left, right) => right.confidence - left.confidence);
}

function getSeverity(config: DesignMemoryConfig, ruleId: RuleId): RuleSeverity {
  return config.rules[ruleId];
}

function buildFingerprint(filePath: string, componentName: string, ruleId: string, expected: string, found: string) {
  return hashParts([
    normalizeForMatch(componentName),
    ruleId,
    filePath,
    normalizeForMatch(expected),
    normalizeForMatch(found),
  ]);
}

function createIssue(
  config: DesignMemoryConfig,
  params: {
    ruleId: RuleId;
    componentName: string;
    filePath: string;
    expected: string;
    found: string;
    evidenceSnippet: string;
    suggestedAction: string;
    confidence?: number;
    detectionSource?: DetectionSource;
  },
): DriftIssue | null {
  const severity = getSeverity(config, params.ruleId);
  if (severity === 'ignore') {
    return null;
  }

  return {
    fingerprint: buildFingerprint(params.filePath, params.componentName, params.ruleId, params.expected, params.found),
    ruleId: params.ruleId,
    issueType: toIssueType(params.ruleId),
    severity,
    confidence: params.confidence ?? 0.98,
    componentName: params.componentName,
    filePath: params.filePath,
    expected: params.expected,
    found: params.found,
    evidenceSnippet: params.evidenceSnippet,
    suggestedAction: params.suggestedAction,
    detectionSource: params.detectionSource ?? 'deterministic',
    status: 'new',
  };
}

function pushIssue(target: DriftIssue[], issue: DriftIssue | null) {
  if (!issue) return;
  if (target.some((entry) => entry.fingerprint === issue.fingerprint)) return;
  target.push(issue);
}

function findDeterministicIssues(snapshot: ReferenceSnapshot, files: FileDiff[], mappings: Mapping[], config: DesignMemoryConfig) {
  const issues: DriftIssue[] = [];
  const allowedHexes = new Set(snapshot.tokens.map((token) => token.value?.toLowerCase()).filter(Boolean) as string[]);
  const tokenMatchers = snapshot.tokens.map((token) => ({
    token,
    aliases: uniqueStrings([token.name, ...(token.aliases ?? []), ...(token.codeHints ?? []), ...(snapshot.aliasMap?.[token.name] ?? [])]),
  }));

  for (const file of files) {
    const fileMappings = mappings.filter((mapping) => mapping.filePath === file.filePath);
    const defaultComponentName = fileMappings[0]?.componentName ?? (toPascalCase(getFileStem(file.filePath)) || 'UnknownComponent');
    const rawText = file.addedLines.join('\n');
    const fullText = file.fullContent ?? rawText;

    const rawHexes = Array.from(new Set(rawText.match(/#(?:[0-9a-fA-F]{3,8})\b/g) ?? []));
    for (const hex of rawHexes) {
      if (!allowedHexes.has(hex.toLowerCase())) {
        pushIssue(issues, createIssue(config, {
          ruleId: 'color.raw-hex',
          componentName: defaultComponentName,
          filePath: file.filePath,
          expected: 'Use approved color tokens from the reference snapshot.',
          found: hex,
          evidenceSnippet: rawText,
          suggestedAction: `Replace ${hex} with an approved design token or token-backed class.`,
        }));
      }
    }

    for (const line of file.addedLines) {
      const spacingMatches = line.match(/\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap)-\[[^\]]+\]/g) ?? [];
      for (const match of spacingMatches) {
        pushIssue(issues, createIssue(config, {
          ruleId: 'tailwind.arbitrary-spacing',
          componentName: defaultComponentName,
          filePath: file.filePath,
          expected: 'Use token-backed spacing classes instead of arbitrary spacing values.',
          found: match,
          evidenceSnippet: line,
          suggestedAction: `Replace ${match} with an approved spacing token/class.`,
        }));
      }

      const radiusMatches = line.match(/\brounded(?:-[trbl]{1,2})?-\[[^\]]+\]/g) ?? [];
      for (const match of radiusMatches) {
        pushIssue(issues, createIssue(config, {
          ruleId: 'tailwind.arbitrary-radius',
          componentName: defaultComponentName,
          filePath: file.filePath,
          expected: 'Use approved radius classes instead of arbitrary radius values.',
          found: match,
          evidenceSnippet: line,
          suggestedAction: `Replace ${match} with an approved radius token/class.`,
        }));
      }

      const fontSizeMatches = line.match(/\btext-\[[^\]]+\]/g) ?? [];
      for (const match of fontSizeMatches) {
        pushIssue(issues, createIssue(config, {
          ruleId: 'tailwind.arbitrary-font-size',
          componentName: defaultComponentName,
          filePath: file.filePath,
          expected: 'Use approved typography scale classes instead of arbitrary font-size values.',
          found: match,
          evidenceSnippet: line,
          suggestedAction: `Replace ${match} with an approved typography token/class.`,
        }));
      }

      if (/style=\{\{/.test(line)) {
        pushIssue(issues, createIssue(config, {
          ruleId: 'style.inline',
          componentName: defaultComponentName,
          filePath: file.filePath,
          expected: 'Avoid inline styles in audited UI files.',
          found: 'style={{ ... }}',
          evidenceSnippet: line,
          suggestedAction: 'Move the inline style into approved Tailwind utilities or token-backed classes.',
        }));
      }
    }

    for (const mapping of fileMappings) {
      const component = snapshot.components[mapping.referenceIndex];
      const joinedLines = rawText;
      const evaluatedText = fullText;

      for (const pattern of component.disallowedPatterns ?? []) {
        if (joinedLines.includes(pattern)) {
          pushIssue(issues, createIssue(config, {
            ruleId: 'component.disallowed-pattern',
            componentName: component.name,
            filePath: file.filePath,
            expected: `Avoid disallowed pattern ${pattern} for ${component.name}.`,
            found: pattern,
            evidenceSnippet: joinedLines,
            suggestedAction: `Remove or replace ${pattern} with the approved pattern for ${component.name}.`,
          }));
        }
      }

      for (const pattern of component.requiredPatterns ?? []) {
        if (joinedLines && !evaluatedText.includes(pattern)) {
          pushIssue(issues, createIssue(config, {
            ruleId: 'component.required-pattern',
            componentName: component.name,
            filePath: file.filePath,
            expected: `Include required pattern ${pattern} for ${component.name} somewhere in the file.`,
            found: 'Pattern missing from the evaluated file content.',
            evidenceSnippet: joinedLines,
            suggestedAction: `Add the required pattern ${pattern} or align the component with the reference snapshot.`,
            confidence: 0.87,
          }));
        }
      }

      for (const state of component.states ?? []) {
        const statePattern = `${state.name}:`;
        const hasAnyState = evaluatedText.includes(statePattern) || evaluatedText.includes(`data-[state=${state.name}]`) || evaluatedText.includes(`aria-${state.name}`);
        const touchedStateRegion = joinedLines.length > 0;
        if (!hasAnyState && touchedStateRegion) {
          pushIssue(issues, createIssue(config, {
            ruleId: 'component.missing-state',
            componentName: component.name,
            filePath: file.filePath,
            expected: `Provide explicit ${state.name} state support for ${component.name}.`,
            found: `${state.name} state not found in the evaluated file content.`,
            evidenceSnippet: joinedLines,
            suggestedAction: `Add the ${state.name} state styling/behavior expected by the reference snapshot.`,
            confidence: 0.82,
          }));
        }
      }

      for (const variant of component.variants ?? []) {
        const variantName = normalizeForMatch(variant.name);
        if (variantName && joinedLines.toLowerCase().includes('variant') && !normalizeForMatch(evaluatedText).includes(variantName)) {
          pushIssue(issues, createIssue(config, {
            ruleId: 'component.variant-drift',
            componentName: component.name,
            filePath: file.filePath,
            expected: `Use approved ${component.name} variants from the reference snapshot.`,
            found: 'Changed code references variants that do not match the approved variant set.',
            evidenceSnippet: joinedLines,
            suggestedAction: `Align the variant values with the approved ${component.name} variants.`,
            confidence: 0.74,
          }));
        }
      }

      for (const tokenName of component.tokensUsed ?? []) {
        const matcher = tokenMatchers.find((entry) => normalizeForMatch(entry.token.name) === normalizeForMatch(tokenName));
        if (!matcher || matcher.aliases.length === 0) {
          continue;
        }

        const matchesAnyAlias = matcher.aliases.some((alias) => normalizeForMatch(evaluatedText).includes(normalizeForMatch(alias)));
        const changedAnyTokenishThing = matcher.aliases.some((alias) => normalizeForMatch(joinedLines).includes(normalizeForMatch(alias))) || /(bg-|text-|border-|ring-|rounded-|shadow-|#)/.test(joinedLines);
        if (!matchesAnyAlias && changedAnyTokenishThing) {
          pushIssue(issues, createIssue(config, {
            ruleId: 'token.mismatch',
            componentName: component.name,
            filePath: file.filePath,
            expected: `Use approved token ${matcher.token.name} for ${component.name}.`,
            found: 'Changed code does not reference any approved token aliases or code hints.',
            evidenceSnippet: joinedLines,
            suggestedAction: `Replace hardcoded values with ${matcher.token.name} or one of its approved aliases.`,
            confidence: 0.8,
          }));
        }
      }
    }
  }

  return issues;
}

export function buildAuditPrompt(snapshot: ReferenceSnapshot, issues: DriftIssue[], files: FileDiff[]) {
  return {
    systemPrompt: `You are the non-blocking explanation layer for Design Memory. You may clarify findings, but you must not invent new blocking issues.
Return raw JSON in this exact format:
{
  "explanations": [
    { "fingerprint": string, "suggestedAction": string }
  ]
}`,
    userPrompt: `REFERENCE SNAPSHOT:
${prettyJson(snapshot.metadata)}

DETERMINISTIC FACTS:
${prettyJson(issues.map((issue) => ({
  fingerprint: issue.fingerprint,
  ruleId: issue.ruleId,
  componentName: issue.componentName,
  filePath: issue.filePath,
  expected: issue.expected,
  found: issue.found,
  evidenceSnippet: issue.evidenceSnippet,
})))}

FILES ANALYZED:
${prettyJson(files.map((file) => ({ filePath: file.filePath, addedLines: file.addedLines })))}`,
  };
}

function parseExplainOnlyResponse(response: string): LlmAuditResponse {
  const parsed = JSON.parse(response) as LlmAuditResponse;
  return {
    explanations: Array.isArray(parsed.explanations) ? parsed.explanations : [],
  };
}

function applyReviewAndBaselineState(issues: DriftIssue[], cwd: string) {
  const reviews = loadReviews(cwd).reviews;
  const baseline = loadBaseline(cwd);
  const previousRun = loadLatestRun(cwd);
  const runHistory = loadRunHistory(cwd);
  const previousFingerprints = new Set(previousRun?.issues.filter((issue) => ['new', 'remaining', 'reopened', 'intentional', 'ignored'].includes(issue.status)).map((issue) => issue.fingerprint) ?? []);
  const previousIssueKeys = new Map((previousRun?.issues ?? []).map((issue) => [getIssueKey(issue), issue.fingerprint]));
  const historicalIssueKeys = new Map(
    runHistory
      .flatMap((run) => run.issues)
      .map((issue) => [getIssueKey(issue), issue.fingerprint] as const),
  );
  const historicalFingerprints = new Set(runHistory.flatMap((run) => run.issues.map((issue) => issue.fingerprint)));
  const baselineFingerprints = new Set(Object.keys(baseline?.acceptedFingerprints ?? {}));

  return issues.map((issue) => {
    const review = reviews[issue.fingerprint];
    if (review?.status === 'intentional') {
      return { ...issue, status: 'intentional' as const };
    }
    if (review?.status === 'ignore') {
      return { ...issue, status: 'ignored' as const };
    }
    const previousFingerprintForKey = previousIssueKeys.get(getIssueKey(issue));
    if (previousFingerprintForKey && previousFingerprintForKey !== issue.fingerprint) {
      return { ...issue, status: 'reopened' as const };
    }
    if (historicalFingerprints.has(issue.fingerprint) && !previousFingerprints.has(issue.fingerprint)) {
      return { ...issue, status: 'reopened' as const };
    }
    const historicalFingerprintForKey = historicalIssueKeys.get(getIssueKey(issue));
    if (historicalFingerprintForKey && !previousFingerprints.has(issue.fingerprint) && historicalFingerprintForKey !== issue.fingerprint) {
      return { ...issue, status: 'reopened' as const };
    }
    if (previousFingerprints.has(issue.fingerprint) || baselineFingerprints.has(issue.fingerprint)) {
      return { ...issue, status: 'remaining' as const };
    }
    return { ...issue, status: 'new' as const };
  });
}

function computeComparison(current: DriftIssue[], previous: AuditRun | null) {
  const previousFingerprints = new Set(previous?.issues.map((issue) => issue.fingerprint) ?? []);
  const currentFingerprints = new Set(current.map((issue) => issue.fingerprint));
  const resolved = [...previousFingerprints].filter((fingerprint) => !currentFingerprints.has(fingerprint));
  const remaining = [...currentFingerprints].filter((fingerprint) => previousFingerprints.has(fingerprint));
  const added = current.filter((issue) => issue.status === 'new').map((issue) => issue.fingerprint);

  return {
    resolvedFingerprints: resolved,
    remainingFingerprints: remaining,
    newFingerprints: added,
    reopenedFingerprints: current.filter((issue) => issue.status === 'reopened').map((issue) => issue.fingerprint),
  };
}

function summarize(issues: DriftIssue[]) {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const issue of issues) {
    byType[issue.issueType] = (byType[issue.issueType] ?? 0) + 1;
    byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
  }

  return {
    totalIssues: issues.length,
    error: issues.filter((issue) => issue.severity === 'error').length,
    warn: issues.filter((issue) => issue.severity === 'warn').length,
    byType,
    byStatus,
  };
}

function printHumanReport(run: AuditRun, createBaselineRun: boolean) {
  console.log(`[Design Memory] Files analyzed: ${run.filesAnalyzed.length}`);
  console.log(`[Design Memory] Components matched: ${run.matchedComponents.length}`);
  console.log(`[Design Memory] Deterministic findings: ${run.issues.filter((issue) => issue.detectionSource === 'deterministic').length}`);
  console.log(`[Design Memory] LLM-assisted findings: ${run.issues.filter((issue) => issue.detectionSource === 'llm-assisted').length}`);

  if (createBaselineRun) {
    console.log('[Design Memory] Baseline created from the current findings. Future runs will block only on net-new or reopened issues.');
    return;
  }

  if (run.issues.length === 0) {
    console.log('\x1b[32m%s\x1b[0m', '[Design Memory] ✅ No design-system drift found.');
    return;
  }

  for (const issue of run.issues) {
    console.log(`\n[${issue.severity.toUpperCase()}] ${issue.componentName} — ${issue.ruleId} (${issue.status})`);
    console.log(`File: ${issue.filePath}`);
    console.log(`Expected: ${issue.expected}`);
    console.log(`Found: ${issue.found}`);
    console.log(`Evidence: ${issue.evidenceSnippet}`);
    console.log(`Fix: ${issue.suggestedAction}`);
  }
}

export async function scanPullRequest(prNumber: number, cwd = process.cwd(), options: Pick<AuditOptions, 'json'> = {}) {
  const scan = getPullRequestScan(prNumber, cwd);
  return runAudit({}, {
    cwd,
    mode: 'scan',
    diff: scan.diff,
    label: `PR #${prNumber}: ${scan.title}\nSource: ${scan.url}`,
    json: options.json,
    prScan: scan,
  });
}

export async function runAudit(deps: AuditDependencies = {}, options: AuditOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const mode = options.mode ?? 'staged';
  const config = readConfig(cwd);
  const getDiff = deps.getDiff ?? ((targetCwd?: string) => getStagedDiff(targetCwd ?? cwd));
  const getFileContent = deps.getFileContent ?? ((filePath: string, targetCwd?: string) => getStagedFileContent(filePath, targetCwd ?? cwd));
  const getSnapshot = deps.getSnapshot ?? loadReferenceSnapshot;
  const resolveSnapshot = deps.resolveSnapshot ?? resolveReferenceSnapshot;
  const getBrain = deps.getBrain ?? ((fetchFn?: typeof fetch) => detectAvailableBrain(fetchFn ?? fetch, cwd));
  const askBrain = deps.askBrain ?? promptBrain;
  const exit = deps.exit ?? process.exit;

  console.log('\x1b[36m%s\x1b[0m', '[Design Memory] Starting audit...');
  const diff = options.diff ?? getDiff(cwd);
  if (!diff) {
    console.log('[Design Memory] No staged UI changes detected. Skipping audit.');
    exit(0);
    return;
  }

  let snapshot = getSnapshot(cwd);
  if (!snapshot) {
    console.error('[Design Memory] No reference snapshot found. Run `design-memory sync-reference` first.');
    exit(1);
    return;
  }
  if (!snapshot.metadata.importedAt) {
    snapshot = await resolveSnapshot(cwd);
  }

  const files = parseDiffIntoFiles(diff, config, cwd).map((file) => ({
    ...file,
    fullContent:
      mode === 'staged'
        ? getFileContent(file.filePath, cwd)
        : options.prScan?.files.find((entry) => entry.path === file.filePath)?.content ?? null,
  }));
  const mappings = matchComponents(snapshot, files);
  let issues = findDeterministicIssues(snapshot, files, mappings, config);
  issues = applyReviewAndBaselineState(issues, cwd);

  if (config.llmFallback.enabled && config.llmFallback.mode !== 'disabled' && issues.length > 0) {
    const brain = await getBrain();
    if (brain) {
      try {
        const { systemPrompt, userPrompt } = buildAuditPrompt(snapshot, issues, files);
        const response = await askBrain(brain, systemPrompt, userPrompt);
        const parsed = parseExplainOnlyResponse(response);
        issues = issues.map((issue) => ({
          ...issue,
          suggestedAction: parsed.explanations?.find((entry) => entry.fingerprint === issue.fingerprint)?.suggestedAction ?? issue.suggestedAction,
          detectionSource: issue.detectionSource,
        }));
      } catch {
        // Keep the core deterministic flow resilient.
      }
    }
  }

  const previousRun = loadLatestRun(cwd);
  const comparison = computeComparison(issues, previousRun);
  const run: AuditRun = {
    id: makeRunId(),
    status: 'completed',
    summary: {
      ...summarize(issues),
      resolvedCount: comparison.resolvedFingerprints.length,
      remainingCount: comparison.remainingFingerprints.length,
    },
    filesAnalyzed: files.map((file) => file.filePath),
    matchedComponents: mappings.map((mapping) => ({
      filePath: mapping.filePath,
      componentName: mapping.componentName,
      confidence: mapping.confidence,
      detectionSource: mapping.detectionSource,
    })),
    issues,
    comparison,
    createdAt: new Date().toISOString(),
  };

  saveAuditRun(run, cwd);

  if (options.createBaseline) {
    createBaseline(issues.map((issue) => issue.fingerprint), cwd);
    if (options.json) {
      console.log(prettyJson(run));
    } else {
      printHumanReport(run, true);
    }
    exit(0);
    return;
  }

  if (options.json) {
    console.log(prettyJson(run));
  } else {
    if (options.label) {
      console.log(`[Design Memory] ${options.label}`);
    }
    printHumanReport(run, false);
  }

  const blockingIssues = issues.filter((issue) => issue.severity === 'error' && (issue.status === 'new' || issue.status === 'reopened'));
  if (blockingIssues.length > 0 && mode !== 'scan' && config.strictness === 'block') {
    console.warn('\x1b[33m%s\x1b[0m', '\n[Design Memory] ⚠️ Commit blocked. If this is a false positive, force the commit by running: git commit --no-verify');
    exit(1);
    return;
  }

  exit(0);
}

export function loadLatestRunJson(cwd = process.cwd()) {
  const latest = loadLatestRun(cwd);
  if (!latest) {
    throw new Error('No prior audit run found.');
  }
  return latest;
}

export function reviewFinding(fingerprint: string, status: 'intentional' | 'ignore', note?: string, cwd = process.cwd()) {
  const { saveReview } = require('./state') as typeof import('./state');
  return saveReview({ fingerprint, status, note }, cwd);
}

export function compareRuns(cwd = process.cwd()) {
  const latest = loadLatestRun(cwd);
  if (!latest) {
    throw new Error('No prior audit run found.');
  }

  return latest.comparison ?? {
    resolvedFingerprints: [],
    remainingFingerprints: latest.issues.map((issue) => issue.fingerprint),
    newFingerprints: [],
    reopenedFingerprints: [],
  };
}

export function readFileSnippet(filePath: string, cwd = process.cwd()) {
  const absolute = path.resolve(cwd, filePath);
  return readFileSync(absolute, 'utf-8');
}
