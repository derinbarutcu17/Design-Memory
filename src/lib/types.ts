export type Severity = 'error' | 'warn';

export type ReviewStatus = 'intentional' | 'ignore';
export type DriftStatus = 'new' | 'remaining' | 'resolved' | 'reopened' | 'intentional' | 'ignored';
export type DetectionSource = 'deterministic' | 'llm-assisted';

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
    stitchUrl?: string;
    importedAt?: string;
    fileName?: string;
    lastModified?: string;
    componentCount?: number;
    tokenCount?: number;
    variantCount?: number;
    stateCount?: number;
  };
  tokens: ReferenceToken[];
  components: ComponentReference[];
  aliasMap?: Record<string, string[]>;
};

export type AuditSummary = {
  totalIssues: number;
  error: number;
  warn: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  resolvedCount?: number;
  remainingCount?: number;
};

export type AuditRun = {
  id: string;
  projectId?: string;
  referenceSnapshotId?: string;
  referenceSnapshotSourceType?: string;
  prNumber?: number;
  prTitle?: string;
  commitSha?: string;
  sourcePrUrl?: string;
  sourcePrUpdatedAt?: string;
  prSelectionMode?: 'auto-latest' | 'manual';
  status: 'completed' | 'failed';
  summary: AuditSummary;
  filesAnalyzed: string[];
  matchedComponents: Array<{
    filePath: string;
    componentName: string;
    confidence: number;
    detectionSource: DetectionSource;
  }>;
  issues: DriftIssue[];
  comparison?: {
    resolvedFingerprints: string[];
    remainingFingerprints: string[];
    newFingerprints: string[];
    reopenedFingerprints: string[];
  };
  createdAt: string;
};

export type DriftIssue = {
  fingerprint: string;
  ruleId: string;
  issueType:
    | 'token-mismatch'
    | 'hardcoded-style'
    | 'variant-drift'
    | 'missing-state'
    | 'behavior-drift'
    | 'responsive-drift'
    | 'component-reuse';
  severity: Severity;
  confidence: number;
  componentName: string;
  filePath: string;
  expected: string;
  found: string;
  evidenceSnippet: string;
  suggestedAction: string;
  detectionSource: DetectionSource;
  status: DriftStatus;
};

export type IssueReview = {
  fingerprint: string;
  status: ReviewStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewStore = {
  reviews: Record<string, IssueReview>;
};

export type BaselineStore = {
  acceptedFingerprints: Record<string, string>;
  createdAt: string;
};
