import type { FigmaFileBundle, FigmaNode } from "@/lib/figma/fetch-file";
import type { ReferenceToken } from "@/lib/types";
import { generateNameCandidates, toKebabCase, uniqueStrings } from "@/lib/utils";

function traverse(node: FigmaNode, visit: (node: FigmaNode) => void) {
  visit(node);
  for (const child of node.children ?? []) {
    traverse(child, visit);
  }
}

function extractStyleIds(bundle: FigmaFileBundle) {
  const ids = new Set<string>();
  traverse(bundle.file.document, (node) => {
    for (const styleId of Object.values(node.styles ?? {})) {
      if (styleId) {
        ids.add(styleId);
      }
    }
  });
  return ids;
}

function formatVariableValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value && typeof value === "object") {
    const color = value as { r?: number; g?: number; b?: number; a?: number };
    if (
      typeof color.r === "number" &&
      typeof color.g === "number" &&
      typeof color.b === "number"
    ) {
      const toHex = (channel: number) =>
        Math.round(Math.max(0, Math.min(1, channel)) * 255)
          .toString(16)
          .padStart(2, "0");
      return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
    }
  }

  return undefined;
}

function buildTokenAliases(name: string) {
  const kebab = toKebabCase(name);
  const parts = kebab.split("-").filter(Boolean);
  const tail = parts.slice(-2).join("-");

  return uniqueStrings([
    ...generateNameCandidates(name),
    name.replace(/\//g, "."),
    kebab,
    parts.join("_"),
    tail,
    parts.at(-1),
  ]);
}

function buildTokenCodeHints(name: string, kind?: string) {
  const slug = toKebabCase(name);
  const parts = slug.split("-").filter(Boolean);
  const tail = parts.slice(-2).join("-");
  const tokenSlug = tail || slug;

  if (kind?.toLowerCase().includes("color") || slug.includes("color")) {
    return uniqueStrings([
      `bg-${tokenSlug}`,
      `text-${tokenSlug}`,
      `border-${tokenSlug}`,
      `ring-${tokenSlug}`,
    ]);
  }

  if (kind?.toLowerCase().includes("effect") || slug.includes("shadow")) {
    return uniqueStrings([`shadow-${tokenSlug}`, tokenSlug]);
  }

  if (slug.includes("radius") || slug.includes("corner")) {
    return uniqueStrings([`rounded-${tokenSlug}`, tokenSlug]);
  }

  return uniqueStrings([tokenSlug]);
}

export function extractReferenceTokens(bundle: FigmaFileBundle): ReferenceToken[] {
  const styleIdsInFile = extractStyleIds(bundle);
  const styleTokens: ReferenceToken[] = Object.entries(bundle.file.styles ?? {}).map(([styleId, style]) => ({
    name: style.name,
    kind: style.styleType?.toLowerCase(),
    aliases: buildTokenAliases(style.name),
    codeHints: buildTokenCodeHints(style.name, style.styleType),
    sourceId: styleId,
    sourceType: "figma-style",
  }));

  const variables: ReferenceToken[] = Object.values(bundle.variables?.meta?.variables ?? {}).map((variable) => {
    const firstModeValue = Object.values(variable.valuesByMode ?? {})[0];
    return {
      name: variable.name ?? "Unnamed variable",
      kind: variable.resolvedType?.toLowerCase(),
      value: formatVariableValue(firstModeValue),
      aliases: buildTokenAliases(variable.name ?? "unnamed-variable"),
      codeHints: buildTokenCodeHints(variable.name ?? "unnamed-variable", variable.resolvedType),
      sourceId: variable.id,
      sourceType: "figma-variable",
    } satisfies ReferenceToken;
  });

  const merged = new Map<string, ReferenceToken>();

  for (const token of [...styleTokens, ...variables]) {
    const key = toKebabCase(token.name);
    const existing = merged.get(key);

    merged.set(key, {
      name: token.name,
      kind: token.kind ?? existing?.kind,
      value: token.value ?? existing?.value,
      sourceId: token.sourceId ?? existing?.sourceId,
      sourceType: token.sourceType ?? existing?.sourceType,
      aliases: uniqueStrings([...(existing?.aliases ?? []), ...(token.aliases ?? [])]),
      codeHints: uniqueStrings([...(existing?.codeHints ?? []), ...(token.codeHints ?? [])]),
    });
  }

  const tokens = [...merged.values()];
  const styleOnlyNames = new Set(styleIdsInFile);

  return tokens.sort((left, right) => {
    const leftRank = left.sourceId && styleOnlyNames.has(left.sourceId) ? 0 : 1;
    const rightRank = right.sourceId && styleOnlyNames.has(right.sourceId) ? 0 : 1;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
}
