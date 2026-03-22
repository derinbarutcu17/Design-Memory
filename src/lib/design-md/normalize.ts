import type { ComponentReference, ReferenceSnapshot, ReferenceToken } from '../types';
import { generateNameCandidates, toKebabCase, uniqueStrings } from '../utils';

const GENERIC_HEADINGS = new Set([
  'overview',
  'summary',
  'principles',
  'rules',
  'guidelines',
  'colors',
  'typography',
  'spacing',
  'elevation',
  'tokens',
]);

const STATE_WORDS = ['hover', 'focus', 'disabled', 'active', 'pressed', 'selected', 'loading', 'error'];
const VARIANT_WORDS = ['primary', 'secondary', 'ghost', 'outline', 'destructive', 'success', 'warning', 'danger', 'default'];

function extractHexTokens(markdown: string): ReferenceToken[] {
  return Array.from(new Set(markdown.match(/#(?:[0-9a-fA-F]{3,8})\b/g) ?? [])).map((hex, index) => ({
    name: `color.reference-${index + 1}`,
    kind: 'color',
    value: hex,
    aliases: [hex],
    codeHints: [hex],
    sourceType: 'design-md',
  }));
}

function extractCodeTokens(markdown: string): ReferenceToken[] {
  const codes = Array.from(markdown.matchAll(/`([^`]+)`/g)).map((match) => match[1].trim());
  return uniqueStrings(codes)
    .filter((code) => /(bg-|text-|border-|ring-|rounded-|shadow-|p-|px-|py-|m-|mx-|my-|gap-)/.test(code))
    .map((code) => ({
      name: `hint.${toKebabCase(code)}`,
      kind: 'utility',
      aliases: [code],
      codeHints: [code],
      sourceType: 'design-md',
    }));
}

type Section = {
  heading: string;
  lines: string[];
};

type NormalizeDesignMarkdownOptions = {
  strict?: boolean;
};

function toSections(markdown: string) {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const rawLine of markdown.split('\n')) {
    const headingMatch = rawLine.match(/^#{2,3}\s+(.+?)\s*$/);
    if (headingMatch) {
      current = {
        heading: headingMatch[1].trim(),
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { heading: 'Overview', lines: [] };
      sections.push(current);
    }

    current.lines.push(rawLine);
  }

  return sections;
}

function cleanLine(line: string) {
  return line
    .replace(/^[-*]\s*/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim();
}

function extractInlineCodes(lines: string[]) {
  return uniqueStrings(lines.flatMap((line) => Array.from(line.matchAll(/`([^`]+)`/g)).map((match) => match[1].trim())));
}

function extractNamedList(lines: string[], label: string, allowedValues: string[]) {
  const matches = lines.flatMap((line) => {
    const match = line.match(new RegExp(`^[-*]?\\s*${label}\\s*:\\s*(.+)$`, 'i'));
    if (!match) {
      return [];
    }
    return match[1]
      .split(',')
      .map((part) => cleanLine(part).toLowerCase())
      .filter((value) => allowedValues.includes(value));
  });

  return uniqueStrings(matches);
}

function extractStates(lines: string[]) {
  return extractNamedList(lines, 'states?', STATE_WORDS).map((name) => ({ name }));
}

function extractVariants(lines: string[]) {
  return extractNamedList(lines, 'variants?', VARIANT_WORDS).map((name) => ({ name }));
}

function extractPatternLines(lines: string[], mode: 'required' | 'disallowed', strict = false) {
  const filtered = lines
    .map((line) => ({
      original: line,
      cleaned: cleanLine(line),
    }))
    .filter((entry) => entry.cleaned.length > 0)
    .filter((entry) => {
      const normalized = entry.cleaned.toLowerCase();
      if (strict) {
        return mode === 'required'
          ? /^required\s*:|^must use\s*:|^should use\s*:/.test(normalized)
          : /^disallowed\s*:|^do not use\s*:|^avoid\s*:|^never use\s*:/.test(normalized);
      }
      return mode === 'required'
        ? normalized.includes('must use') || normalized.includes('should use') || normalized.includes('required')
        : normalized.includes('do not use') || normalized.includes('avoid ') || normalized.includes('disallow') || normalized.includes('never use');
    });

  return uniqueStrings([
    ...filtered.flatMap((entry) => Array.from(entry.original.matchAll(/`([^`]+)`/g)).map((match) => match[1].trim())),
    ...filtered.flatMap((entry) => entry.cleaned.match(/\b(?:bg|text|border|ring|rounded|shadow|p|px|py|m|mx|my|gap)-[a-z0-9-:[\]]+/gi) ?? []),
  ]);
}

function extractComponentReferences(markdown: string, strict = false): ComponentReference[] {
  const sections = toSections(markdown);
  const references = sections
    .filter((section) => !GENERIC_HEADINGS.has(section.heading.toLowerCase()))
    .map((section) => {
      const inlineCodes = extractInlineCodes(section.lines);
      const requiredPatterns = extractPatternLines(section.lines, 'required', strict);
      const disallowedPatterns = extractPatternLines(section.lines, 'disallowed', strict);
      const tokensUsed = inlineCodes.filter((code) => /(bg-|text-|border-|ring-|rounded-|shadow-)/.test(code));

      return {
        name: section.heading,
        codeMatches: generateNameCandidates(section.heading),
        aliases: generateNameCandidates(section.heading),
        summary: section.lines.map(cleanLine).filter(Boolean).join(' ').trim() || `Derived from ${section.heading} section in DESIGN.md.`,
        requiredPatterns: requiredPatterns.length ? requiredPatterns : undefined,
        disallowedPatterns: disallowedPatterns.length ? disallowedPatterns : undefined,
        variants: extractVariants(section.lines),
        states: extractStates(section.lines),
        tokensUsed: tokensUsed.length ? tokensUsed.map((token) => `hint.${toKebabCase(token)}`) : undefined,
      } satisfies ComponentReference;
    });

  if (references.length > 0) {
    return references;
  }

  return [
    {
      name: 'DesignSystem',
      codeMatches: ['DesignSystem'],
      aliases: ['DesignSystem'],
      summary: markdown.slice(0, 280).trim(),
    },
  ];
}

export function normalizeDesignMarkdown(markdown: string, fileName = 'DESIGN.md'): ReferenceSnapshot {
  const hexTokens = extractHexTokens(markdown);
  const codeTokens = extractCodeTokens(markdown);
  const allTokens = [...hexTokens, ...codeTokens];
  const components = extractComponentReferences(markdown);

  return buildDesignSnapshot(allTokens, components, fileName);
}

export function normalizeDesignMarkdownWithOptions(
  markdown: string,
  fileName = 'DESIGN.md',
  options: NormalizeDesignMarkdownOptions = {},
): ReferenceSnapshot {
  const hexTokens = extractHexTokens(markdown);
  const codeTokens = extractCodeTokens(markdown);
  const allTokens = [...hexTokens, ...codeTokens];
  const components = extractComponentReferences(markdown, options.strict ?? false);

  return buildDesignSnapshot(allTokens, components, fileName);
}

function buildDesignSnapshot(
  allTokens: ReferenceToken[],
  components: ComponentReference[],
  fileName: string,
): ReferenceSnapshot {

  return {
    metadata: {
      source: 'design-md',
      versionLabel: fileName,
      importedAt: new Date().toISOString(),
      fileName,
      tokenCount: allTokens.length,
      componentCount: components.length,
      variantCount: components.reduce((count, component) => count + (component.variants?.length ?? 0), 0),
      stateCount: components.reduce((count, component) => count + (component.states?.length ?? 0), 0),
    },
    tokens: allTokens,
    components,
    aliasMap: Object.fromEntries(allTokens.map((token) => [token.name, uniqueStrings([...(token.aliases ?? []), ...(token.codeHints ?? [])])])),
  };
}
