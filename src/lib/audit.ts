import { generateNameCandidates, hashParts, makeId, normalizeForMatch, uniqueStrings } from "@/lib/utils";
import type {
  AuditRun,
  DriftIssue,
  PullRequestDetails,
  ReferenceSnapshot,
  ReviewStatus,
} from "@/lib/types";

type AnalyzeResult = {
  issues: DriftIssue[];
  summary: AuditRun["summary"];
  fixBrief: string;
  comparison: AuditRun["comparison"];
  carriedStatuses: Array<{ fingerprint: string; status: ReviewStatus }>;
};

type PreviousIssueState = {
  issues: DriftIssue[];
  reviews: Array<{ fingerprint: string; status: ReviewStatus }>;
  runId?: string;
};

function createIssue(
  auditRunId: string,
  componentName: string,
  filePath: string,
  issueType: DriftIssue["issueType"],
  severity: DriftIssue["severity"],
  confidence: number,
  expected: string,
  found: string,
  suggestedAction: string,
  evidenceSnippet: string,
) {
  return {
    id: makeId("issue"),
    auditRunId,
    fingerprint: hashParts([componentName, issueType, filePath, expected, found]),
    componentName,
    issueType,
    severity,
    confidence,
    expected,
    found,
    filePath,
    evidenceSnippet: evidenceSnippet.slice(0, 400),
    suggestedAction,
  } satisfies DriftIssue;
}

function extractLikelyVariants(content: string) {
  const variants = new Set<string>();
  const cvaMatch = content.match(/variants?\s*:\s*\{([\s\S]{0,1200}?)\n\s*\}/);

  if (cvaMatch?.[1]) {
    for (const match of cvaMatch[1].matchAll(/([A-Za-z0-9_-]+)\s*:/g)) {
      variants.add(match[1]);
    }
  }

  const unionMatch = content.match(/variant\??:\s*("([^"]+)"(?:\s*\|\s*"[^"]+")*)/);
  if (unionMatch?.[1]) {
    for (const value of unionMatch[1].split("|")) {
      variants.add(value.replace(/"/g, "").trim());
    }
  }

  return [...variants];
}

function collectEvidence(text: string, patterns: string[]) {
  const lines = text.split("\n");

  for (const pattern of patterns) {
    const line = lines.find((entry) => entry.includes(pattern));
    if (line) {
      return line.trim();
    }
  }

  return lines.find((entry) => entry.trim())?.trim() ?? "No direct snippet available.";
}

function hasCandidateMatch(text: string, normalizedText: string, candidates: string[]) {
  return candidates.some((candidate) => {
    const normalized = normalizeForMatch(candidate);
    return text.includes(candidate.toLowerCase()) || (normalized.length > 2 && normalizedText.includes(normalized));
  });
}

function buildComponentCandidates(component: ReferenceSnapshot["components"][number]) {
  return uniqueStrings([
    component.name,
    ...(component.codeMatches ?? []),
    ...(component.aliases ?? []),
    ...generateNameCandidates(component.name),
  ]);
}

function buildTokenCandidateMap(snapshot: ReferenceSnapshot) {
  const map = new Map<string, string[]>();

  for (const token of snapshot.tokens) {
    map.set(
      token.name,
      uniqueStrings([
        token.name,
        ...(token.aliases ?? []),
        ...(token.codeHints ?? []),
        ...(snapshot.aliasMap?.[token.name] ?? []),
      ]),
    );
  }

  return map;
}

function collectComponentTokenCandidates(
  component: ReferenceSnapshot["components"][number],
  tokenCandidateMap: Map<string, string[]>,
) {
  return uniqueStrings(
    (component.tokensUsed ?? []).flatMap((tokenName) => tokenCandidateMap.get(tokenName) ?? []),
  );
}

function findMatchedCandidates(text: string, normalizedText: string, candidates: string[]) {
  return candidates.filter((candidate) => hasCandidateMatch(text, normalizedText, [candidate]));
}

function hasStyleSignals(text: string) {
  return /className|style=\{\{|bg-|text-|border-|rounded-|px-|py-|shadow-|ring-/.test(text);
}

export function generateFixBrief(
  pr: PullRequestDetails,
  issues: DriftIssue[],
  reviews: Map<string, ReviewStatus>,
) {
  const activeIssues = issues.filter((issue) => {
    const status = reviews.get(issue.fingerprint);
    return status !== "intentional" && status !== "ignore";
  });

  const components = [...new Set(activeIssues.map((issue) => issue.componentName))];
  const files = [...new Set(activeIssues.map((issue) => issue.filePath))];
  const grouped = activeIssues.reduce<Record<string, DriftIssue[]>>((acc, issue) => {
    acc[issue.componentName] ??= [];
    acc[issue.componentName].push(issue);
    return acc;
  }, {});

  const sections = [
    `1. PR context`,
    `PR #${pr.number}: ${pr.title}`,
    ``,
    `2. Affected components`,
    components.length ? components.join(", ") : "No actionable components selected.",
    ``,
    `3. Issue summary`,
    `${activeIssues.length} actionable drift issue(s) across ${files.length} file(s).`,
    ``,
    `4. Exact expected vs found problems`,
  ];

  for (const [componentName, componentIssues] of Object.entries(grouped)) {
    sections.push(`- ${componentName}`);
    for (const issue of componentIssues) {
      sections.push(
        `  • ${issue.issueType} in ${issue.filePath}: expected ${issue.expected}; found ${issue.found}.`,
      );
    }
  }

  sections.push(
    ``,
    `5. Recommended fixes in priority order`,
    `- Fix high-severity token and hardcoded-style issues first.`,
    `- Restore missing states before introducing new variants.`,
    `- Align custom variants with the approved Figma names and patterns.`,
    ``,
    `6. Preserve intended design system behavior`,
    `Keep shared tokens, allowed variants, and required states aligned with the imported Figma reference.`,
  );

  return sections.join("\n");
}

export function analyzeDrift(
  auditRunId: string,
  snapshot: ReferenceSnapshot,
  pr: PullRequestDetails,
  previous?: PreviousIssueState,
): AnalyzeResult {
  const issues: DriftIssue[] = [];
  const tokenCandidateMap = buildTokenCandidateMap(snapshot);

  for (const file of pr.files) {
    const text = [file.patch ?? "", file.contents ?? ""].join("\n");
    const fileLower = `${file.filename}\n${text}`.toLowerCase();
    const normalizedFile = normalizeForMatch(`${file.filename}\n${text}`);

    for (const component of snapshot.components) {
      const componentCandidates = buildComponentCandidates(component);
      const componentMatch = hasCandidateMatch(fileLower, normalizedFile, componentCandidates);

      if (!componentMatch) {
        continue;
      }

      const componentTokenCandidates = collectComponentTokenCandidates(component, tokenCandidateMap);
      const matchedTokenCandidates = findMatchedCandidates(
        fileLower,
        normalizedFile,
        componentTokenCandidates.map((candidate) => candidate.toLowerCase()),
      );
      const missingPatterns = (component.requiredPatterns ?? []).filter(
        (pattern) => !text.includes(pattern),
      );

      if (
        missingPatterns.length > 0 ||
        (componentTokenCandidates.length > 0 &&
          matchedTokenCandidates.length === 0 &&
          hasStyleSignals(text))
      ) {
        issues.push(
          createIssue(
            auditRunId,
            component.name,
            file.filename,
            "token-mismatch",
            missingPatterns.length > 2 ? "high" : "medium",
            0.76,
            missingPatterns.length > 0
              ? `shared patterns ${missingPatterns.join(", ")}`
              : `recognized token aliases ${componentTokenCandidates.slice(0, 6).join(", ")}`,
            matchedTokenCandidates.length > 0
              ? `partial token coverage ${matchedTokenCandidates.join(", ")}`
              : "no recognized token aliases or code hints were found in the changed implementation",
            "Reintroduce the shared utility/token patterns or aliases used by the approved component.",
            collectEvidence(
              text,
              [...missingPatterns, ...componentTokenCandidates, ...(component.codeMatches ?? [])].slice(0, 8),
            ),
          ),
        );
      }

      const hardcodedSignals = [
        ...new Set(
          [
            ...(text.match(/#[0-9a-fA-F]{3,8}/g) ?? []),
            ...(text.match(/[a-z-]+-\[[^\]]+\]/g) ?? []),
          ].slice(0, 6),
        ),
      ];
      const hasDisallowedPattern = (component.disallowedPatterns ?? []).some((pattern) =>
        text.includes(pattern),
      );

      if (hardcodedSignals.length > 0 || hasDisallowedPattern) {
        issues.push(
          createIssue(
            auditRunId,
            component.name,
            file.filename,
            "hardcoded-style",
            matchedTokenCandidates.length === 0 ? "high" : "medium",
            matchedTokenCandidates.length === 0 ? 0.86 : 0.74,
            componentTokenCandidates.length > 0
              ? `shared tokens or aliases such as ${componentTokenCandidates.slice(0, 4).join(", ")}`
              : "shared tokens or named utilities from the approved system",
            hardcodedSignals.length
              ? `hardcoded values ${hardcodedSignals.join(", ")}`
              : "disallowed raw styling pattern",
            "Replace raw values and arbitrary utilities with the component's approved design tokens.",
            collectEvidence(
              text,
              hardcodedSignals.length ? hardcodedSignals : component.disallowedPatterns ?? [],
            ),
          ),
        );
      }

      if (component.variants?.length) {
        const allowedVariants = component.variants.map((variant) => variant.name);
        const detectedVariants = extractLikelyVariants(text);
        const unexpectedVariants = detectedVariants.filter(
          (variant) =>
            !allowedVariants.some(
              (allowed) => normalizeForMatch(allowed) === normalizeForMatch(variant),
            ),
        );

        if (unexpectedVariants.length > 0) {
          issues.push(
            createIssue(
              auditRunId,
              component.name,
              file.filename,
              "variant-drift",
              "medium",
              0.7,
              `allowed variants ${allowedVariants.join(", ")}`,
              `unexpected variants ${unexpectedVariants.join(", ")}`,
              "Rename or remove custom variants so the code matches the approved Figma variant set.",
              collectEvidence(text, unexpectedVariants),
            ),
          );
        }
      }

      const missingStates = (component.states ?? []).filter((state) =>
        (state.requiredPatterns ?? []).every((pattern) => !text.includes(pattern)),
      );

      if (missingStates.length > 0) {
        issues.push(
          createIssue(
            auditRunId,
            component.name,
            file.filename,
            "missing-state",
            "medium",
            0.73,
            `state coverage for ${missingStates.map((state) => state.name).join(", ")}`,
            "required interaction or disabled-state markers are missing",
            "Add the missing state styles or variant branches for the approved interaction model.",
            collectEvidence(
              text,
              missingStates.flatMap((state) => state.requiredPatterns ?? []),
            ),
          ),
        );
      }

      if (
        component.name === "Button" &&
        text.includes("<button") &&
        !text.includes("import { Button") &&
        !text.includes("<Button")
      ) {
        issues.push(
          createIssue(
            auditRunId,
            component.name,
            file.filename,
            "component-reuse",
            "low",
            0.49,
            "shared Button component usage",
            "raw <button> markup detected in a file that appears to touch Button behavior",
            "Prefer the shared Button primitive unless this is a documented exception.",
            collectEvidence(text, ["<button"]),
          ),
        );
      }
    }
  }

  const dedupedIssues = Array.from(new Map(issues.map((issue) => [issue.fingerprint, issue])).values());
  const byType = dedupedIssues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.issueType] = (acc[issue.issueType] ?? 0) + 1;
    return acc;
  }, {});

  const previousFingerprints = new Set(previous?.issues.map((issue) => issue.fingerprint) ?? []);
  const currentFingerprints = new Set(dedupedIssues.map((issue) => issue.fingerprint));
  const resolvedFingerprints = [...previousFingerprints].filter(
    (fingerprint) => !currentFingerprints.has(fingerprint),
  );
  const remainingFingerprints = [...currentFingerprints].filter((fingerprint) =>
    previousFingerprints.has(fingerprint),
  );
  const newFingerprints = [...currentFingerprints].filter(
    (fingerprint) => !previousFingerprints.has(fingerprint),
  );
  const carriedStatuses =
    previous?.reviews.filter((review) => currentFingerprints.has(review.fingerprint)) ?? [];
  const reviewMap = new Map(carriedStatuses.map((review) => [review.fingerprint, review.status]));

  return {
    issues: dedupedIssues,
    summary: {
      totalIssues: dedupedIssues.length,
      high: dedupedIssues.filter((issue) => issue.severity === "high").length,
      medium: dedupedIssues.filter((issue) => issue.severity === "medium").length,
      low: dedupedIssues.filter((issue) => issue.severity === "low").length,
      byType,
      resolvedCount: resolvedFingerprints.length,
      remainingCount: remainingFingerprints.length,
    },
    fixBrief: generateFixBrief(pr, dedupedIssues, reviewMap),
    comparison: {
      baselineRunId: previous?.runId,
      resolvedFingerprints,
      remainingFingerprints,
      newFingerprints,
    },
    carriedStatuses,
  };
}
