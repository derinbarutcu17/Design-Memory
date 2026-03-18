import type { FigmaFileBundle, FigmaNode } from "@/lib/figma/fetch-file";
import type { ComponentReference, ReferenceToken } from "@/lib/types";
import { generateNameCandidates, toKebabCase, uniqueStrings } from "@/lib/utils";

const STATE_WORDS = [
  "hover",
  "focus",
  "disabled",
  "active",
  "pressed",
  "selected",
  "error",
  "loading",
  "default",
  "open",
  "closed",
];

function traverse(node: FigmaNode, visit: (node: FigmaNode, parent?: FigmaNode) => void, parent?: FigmaNode) {
  visit(node, parent);
  for (const child of node.children ?? []) {
    traverse(child, visit, node);
  }
}

function buildNodeIndex(root: FigmaNode) {
  const index = new Map<string, FigmaNode>();
  traverse(root, (node) => {
    index.set(node.id, node);
  });
  return index;
}

function inferBaseName(nodeName: string) {
  const commaBase = nodeName.split(",")[0]?.trim();
  const slashBase = commaBase?.split("/")[0]?.trim();
  return slashBase || nodeName.trim();
}

function inferVariantValues(name: string) {
  if (name.includes("=")) {
    return name
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [property, rawValue] = part.split("=");
        return {
          property: property?.trim() || "variant",
          value: rawValue?.trim() || property?.trim() || "default",
        };
      });
  }

  const slashParts = name.split("/").map((part) => part.trim()).filter(Boolean);
  if (slashParts.length > 1) {
    return slashParts.slice(1).map((value) => ({ property: "variant", value }));
  }

  return [];
}

function collectStyleIds(node: FigmaNode, ids = new Set<string>()) {
  for (const styleId of Object.values(node.styles ?? {})) {
    if (styleId) {
      ids.add(styleId);
    }
  }

  for (const child of node.children ?? []) {
    collectStyleIds(child, ids);
  }

  return ids;
}

function collectBoundVariableIds(value: unknown, ids = new Set<string>()) {
  if (!value) {
    return ids;
  }

  if (typeof value === "string" && value.startsWith("VariableID:")) {
    ids.add(value);
    return ids;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBoundVariableIds(item, ids);
    }
    return ids;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key.toLowerCase().includes("variable") && typeof nested === "string") {
        ids.add(nested);
      } else {
        collectBoundVariableIds(nested, ids);
      }
    }
  }

  return ids;
}

function buildComponentAliases(name: string) {
  const kebab = toKebabCase(name);
  const parts = kebab.split("-").filter(Boolean);
  const base = parts.slice(0, 2).join("-");

  return uniqueStrings([
    ...generateNameCandidates(name),
    name.replace(/\//g, " "),
    name.replace(/\//g, ""),
    base,
    parts.at(0),
  ]);
}

function buildRequiredPatterns(tokensUsed: string[], tokenIndex: Map<string, ReferenceToken>) {
  return uniqueStrings(
    tokensUsed.flatMap((tokenName) => {
      const token = tokenIndex.get(toKebabCase(tokenName));
      return token?.codeHints?.slice(0, 2) ?? [];
    }),
  ).slice(0, 6);
}

export function extractComponentReferences(
  bundle: FigmaFileBundle,
  tokens: ReferenceToken[],
): ComponentReference[] {
  const nodeIndex = buildNodeIndex(bundle.file.document);
  const tokenIndex = new Map(tokens.map((token) => [toKebabCase(token.name), token]));
  const styleIdToTokenName = new Map(
    tokens.filter((token) => token.sourceId).map((token) => [token.sourceId as string, token.name]),
  );

  const references = new Map<string, ComponentReference>();

  const addReference = (node: FigmaNode, nodeName: string) => {
    const baseName = inferBaseName(nodeName);
    const key = toKebabCase(baseName);
    const variantValues = (node.children ?? []).flatMap((child) => inferVariantValues(child.name));
    const standaloneValues = inferVariantValues(nodeName);
    const values = [...variantValues, ...standaloneValues];
    const tokenNamesFromStyles = [...collectStyleIds(node)]
      .map((styleId) => styleIdToTokenName.get(styleId))
      .filter((value): value is string => Boolean(value));
    const variableNames = [...collectBoundVariableIds(node.boundVariables)].map((variableId) =>
      tokens.find((token) => token.sourceId === variableId)?.name,
    );
    const tokensUsed = uniqueStrings([...tokenNamesFromStyles, ...variableNames]);
    const states = uniqueStrings(
      values
        .map((entry) => entry.value.toLowerCase())
        .filter((value) => STATE_WORDS.includes(value)),
    ).map((name) => ({ name, requiredPatterns: [] }));
    const variants = uniqueStrings(
      values
        .map((entry) => entry.value)
        .filter((value) => !STATE_WORDS.includes(value.toLowerCase())),
    ).map((name) => ({ name, requiredPatterns: [] }));

    const next: ComponentReference = {
      name: baseName,
      codeMatches: buildComponentAliases(baseName),
      aliases: buildComponentAliases(nodeName),
      summary: `Synced from Figma node ${node.name}.`,
      variants,
      states,
      tokensUsed,
      requiredPatterns: buildRequiredPatterns(tokensUsed, tokenIndex),
      disallowedPatterns: ["bg-[#", "text-[#", "border-[#", "style={{"],
      sourceNodeId: node.id,
    };

    const existing = references.get(key);
    references.set(key, {
      ...next,
      codeMatches: uniqueStrings([...(existing?.codeMatches ?? []), ...(next.codeMatches ?? [])]),
      aliases: uniqueStrings([...(existing?.aliases ?? []), ...(next.aliases ?? [])]),
      tokensUsed: uniqueStrings([...(existing?.tokensUsed ?? []), ...tokensUsed]),
      requiredPatterns: uniqueStrings([
        ...(existing?.requiredPatterns ?? []),
        ...(next.requiredPatterns ?? []),
      ]),
      variants: uniqueStrings([...(existing?.variants ?? []), ...(next.variants ?? [])].map((item) => item.name)).map((name) => ({
        name,
        requiredPatterns: [],
      })),
      states: uniqueStrings([...(existing?.states ?? []), ...(next.states ?? [])].map((item) => item.name)).map((name) => ({
        name,
        requiredPatterns: [],
      })),
    });
  };

  for (const meta of Object.values(bundle.file.componentSets ?? {})) {
    const node = meta.node_id ? nodeIndex.get(meta.node_id) : undefined;
    if (node) {
      addReference(node, meta.name);
    }
  }

  for (const meta of Object.values(bundle.file.components ?? {})) {
    const node = meta.node_id ? nodeIndex.get(meta.node_id) : undefined;
    if (!node) {
      continue;
    }

    const isVariantChild = node.type === "COMPONENT" && node.name.includes("=") && node.name.includes(",");
    if (isVariantChild) {
      continue;
    }

    addReference(node, meta.name);
  }

  if (references.size === 0) {
    traverse(bundle.file.document, (node) => {
      if (node.type === "COMPONENT_SET" || node.type === "COMPONENT") {
        addReference(node, node.name);
      }
    });
  }

  return [...references.values()].sort((left, right) => left.name.localeCompare(right.name));
}
