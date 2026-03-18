import { z } from "zod";

const tokenSchema = z.object({
  name: z.string().min(1),
  kind: z.string().optional(),
  value: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  codeHints: z.array(z.string()).optional(),
  sourceId: z.string().optional(),
  sourceType: z.string().optional(),
});

const variantSchema = z.object({
  name: z.string().min(1),
  requiredPatterns: z.array(z.string()).optional(),
  disallowedPatterns: z.array(z.string()).optional(),
});

const stateSchema = z.object({
  name: z.string().min(1),
  requiredPatterns: z.array(z.string()).optional(),
});

const componentSchema = z.object({
  name: z.string().min(1),
  codeMatches: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  summary: z.string().optional(),
  requiredPatterns: z.array(z.string()).optional(),
  disallowedPatterns: z.array(z.string()).optional(),
  variants: z.array(variantSchema).optional(),
  states: z.array(stateSchema).optional(),
  tokensUsed: z.array(z.string()).optional(),
  sourceNodeId: z.string().optional(),
});

export const referenceSnapshotSchema = z.object({
  metadata: z.object({
    source: z.string().min(1),
    versionLabel: z.string().min(1),
    figmaFileKey: z.string().optional(),
    importedAt: z.string().optional(),
    fileName: z.string().optional(),
    lastModified: z.string().optional(),
    componentCount: z.number().optional(),
    tokenCount: z.number().optional(),
  }),
  tokens: z.array(tokenSchema),
  components: z.array(componentSchema).min(1),
  aliasMap: z.record(z.string(), z.array(z.string())).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(2),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  figmaFileKey: z.string().min(1),
});
