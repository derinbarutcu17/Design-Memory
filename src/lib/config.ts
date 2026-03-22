import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const ruleSeveritySchema = z.enum(['error', 'warn', 'ignore']);

export const designMemoryConfigSchema = z.object({
  strictness: z.enum(['warn', 'block']).default('block'),
  stateDir: z.string().default('.design-memory'),
  reference: z.object({
    sourceType: z.enum(['design-md', 'stitch-markdown', 'figma']).default('design-md'),
    path: z.string().default('./DESIGN.md'),
    figmaFileKey: z.string().optional(),
    figmaUrl: z.string().optional(),
    stitchPath: z.string().optional(),
    strictDesignMd: z.boolean().default(false),
  }).default({
    sourceType: 'design-md',
    path: './DESIGN.md',
    strictDesignMd: false,
  }),
  include: z.array(z.string()).default(['src/components/**/*.tsx', 'src/app/**/*.tsx']),
  exclude: z.array(z.string()).default(['src/lib/**', '**/*.test.tsx', '**/*.test.ts']),
  rules: z.object({
    'color.raw-hex': ruleSeveritySchema.default('error'),
    'tailwind.arbitrary-spacing': ruleSeveritySchema.default('error'),
    'tailwind.arbitrary-radius': ruleSeveritySchema.default('error'),
    'tailwind.arbitrary-font-size': ruleSeveritySchema.default('warn'),
    'style.inline': ruleSeveritySchema.default('error'),
    'token.mismatch': ruleSeveritySchema.default('error'),
    'component.required-pattern': ruleSeveritySchema.default('error'),
    'component.disallowed-pattern': ruleSeveritySchema.default('error'),
    'component.variant-drift': ruleSeveritySchema.default('warn'),
    'component.missing-state': ruleSeveritySchema.default('warn'),
  }).default({
    'color.raw-hex': 'error',
    'tailwind.arbitrary-spacing': 'error',
    'tailwind.arbitrary-radius': 'error',
    'tailwind.arbitrary-font-size': 'warn',
    'style.inline': 'error',
    'token.mismatch': 'error',
    'component.required-pattern': 'error',
    'component.disallowed-pattern': 'error',
    'component.variant-drift': 'warn',
    'component.missing-state': 'warn',
  }),
  baseline: z.object({
    mode: z.enum(['net-new-only']).default('net-new-only'),
  }).default({
    mode: 'net-new-only',
  }),
  llmFallback: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(['disabled', 'explain-only', 'ambiguous-mapping', 'assist-nonblocking']).default('explain-only'),
  }).default({
    enabled: false,
    mode: 'explain-only',
  }),
  ai: z.object({
    providerPreference: z.array(z.enum(['local', 'anthropic', 'openai'])).default(['local', 'anthropic', 'openai']),
    maxRetries: z.number().int().min(0).max(3).default(1),
  }).default({
    providerPreference: ['local', 'anthropic', 'openai'],
    maxRetries: 1,
  }),
  visualProvider: z.enum(['none', 'storybook', 'playwright']).default('none'),
});

export type DesignMemoryConfig = z.infer<typeof designMemoryConfigSchema>;
export type RuleSeverity = z.infer<typeof ruleSeveritySchema>;
export type RuleId = keyof DesignMemoryConfig['rules'];

export const DEFAULT_CONFIG: DesignMemoryConfig = {
  strictness: 'block',
  stateDir: '.design-memory',
  reference: {
    sourceType: 'design-md',
    path: './DESIGN.md',
    figmaFileKey: '',
    figmaUrl: '',
    stitchPath: '',
    strictDesignMd: false,
  },
  include: ['src/components/**/*.tsx', 'src/app/**/*.tsx'],
  exclude: ['src/lib/**', '**/*.test.tsx', '**/*.test.ts'],
  rules: {
    'color.raw-hex': 'error',
    'tailwind.arbitrary-spacing': 'error',
    'tailwind.arbitrary-radius': 'error',
    'tailwind.arbitrary-font-size': 'warn',
    'style.inline': 'error',
    'token.mismatch': 'error',
    'component.required-pattern': 'error',
    'component.disallowed-pattern': 'error',
    'component.variant-drift': 'warn',
    'component.missing-state': 'warn',
  },
  baseline: {
    mode: 'net-new-only',
  },
  llmFallback: {
    enabled: false,
    mode: 'explain-only',
  },
  ai: {
    providerPreference: ['local', 'anthropic', 'openai'],
    maxRetries: 1,
  },
  visualProvider: 'none',
};

export function getConfigPath(cwd = process.cwd()) {
  return path.join(cwd, 'design-memory.config.json');
}

export function getStateDir(cwd = process.cwd(), config?: DesignMemoryConfig) {
  const resolvedConfig = config ?? readConfig(cwd);
  return path.resolve(cwd, resolvedConfig.stateDir);
}

export function readConfig(cwd = process.cwd()): DesignMemoryConfig {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return designMemoryConfigSchema.parse(raw);
}

export function writeDefaultConfig(cwd = process.cwd()) {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
  return configPath;
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(glob: string) {
  const normalized = glob.replace(/\\/g, '/');
  let pattern = '';
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      const after = normalized[index + 2];
      if (after === '/') {
        pattern += '(?:.*/)?';
        index += 3;
      } else {
        pattern += '.*';
        index += 2;
      }
      continue;
    }

    if (char === '*') {
      pattern += '[^/]*';
      index += 1;
      continue;
    }

    pattern += escapeRegex(char);
    index += 1;
  }

  return new RegExp(`^${pattern}$`);
}

export function matchesGlob(filePath: string, glob: string) {
  return globToRegExp(glob).test(filePath.replace(/\\/g, '/'));
}

export function shouldAuditFile(filePath: string, config: DesignMemoryConfig) {
  const normalized = filePath.replace(/\\/g, '/');
  const included =
    config.include.length === 0 || config.include.some((pattern) => matchesGlob(normalized, pattern));
  const excluded = config.exclude.some((pattern) => matchesGlob(normalized, pattern));
  return included && !excluded;
}
