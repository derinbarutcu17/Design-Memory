export type Severity = "high" | "medium" | "low";

export type ReviewStatus = "valid" | "intentional" | "ignore";

export type Project = {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  figmaFileKey: string;
  createdAt: string;
  updatedAt: string;
};

export type ReferenceToken = {
  name: string;
  kind?: string;
  value?: string;
  aliases?: string[];
  codeHints?: string[];
  sourceId?: string;
  sourceType?: string;
};

export type ReferenceVariant = {
  name: string;
  requiredPatterns?: string[];
  disallowedPatterns?: string[];
};

export type ReferenceState = {
  name: string;
  requiredPatterns?: string[];
};

export type ComponentReference = {
  name: string;
  codeMatches?: string[];
  aliases?: string[];
  summary?: string;
  requiredPatterns?: string[];
  disallowedPatterns?: string[];
  variants?: ReferenceVariant[];
  states?: ReferenceState[];
  tokensUsed?: string[];
  sourceNodeId?: string;
};

export type ReferenceSnapshot = {
  metadata: {
    source: string;
    versionLabel: string;
    figmaFileKey?: string;
    importedAt?: string;
    fileName?: string;
    lastModified?: string;
    componentCount?: number;
    tokenCount?: number;
  };
  tokens: ReferenceToken[];
  components: ComponentReference[];
  aliasMap?: Record<string, string[]>;
};

export type ReferenceSnapshotRecord = {
  id: string;
  projectId: string;
  versionLabel: string;
  sourceType: string;
  snapshot: ReferenceSnapshot;
  createdAt: string;
};

export type AuditSummary = {
  totalIssues: number;
  high: number;
  medium: number;
  low: number;
  byType: Record<string, number>;
  resolvedCount?: number;
  remainingCount?: number;
};

export type AuditRun = {
  id: string;
  projectId: string;
  referenceSnapshotId: string;
  prNumber: number;
  prTitle: string;
  commitSha: string;
  status: "completed" | "failed";
  summary: AuditSummary;
  comparison?: {
    baselineRunId?: string;
    resolvedFingerprints: string[];
    remainingFingerprints: string[];
    newFingerprints: string[];
  };
  createdAt: string;
};

export type DriftIssue = {
  id: string;
  auditRunId: string;
  fingerprint: string;
  componentName: string;
  issueType:
    | "token-mismatch"
    | "hardcoded-style"
    | "variant-drift"
    | "missing-state"
    | "component-reuse";
  severity: Severity;
  confidence: number;
  expected: string;
  found: string;
  filePath: string;
  evidenceSnippet: string;
  suggestedAction: string;
};

export type IssueReview = {
  id: string;
  auditRunId: string;
  fingerprint: string;
  status: ReviewStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDetails = {
  project: Project;
  latestSnapshot: ReferenceSnapshotRecord | null;
  auditRuns: AuditRun[];
};

export type PullRequestFile = {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
  changes: number;
  contentsUrl?: string;
  contents?: string;
};

export type PullRequestDetails = {
  number: number;
  title: string;
  headSha: string;
  url: string;
  files: PullRequestFile[];
};
