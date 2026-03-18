import { FigmaSyncError } from "@/lib/figma/client";
import { extractComponentReferences } from "@/lib/figma/extract-components";
import { fetchFigmaFileBundle } from "@/lib/figma/fetch-file";
import { extractReferenceTokens } from "@/lib/figma/extract-tokens";
import type { FigmaFileBundle } from "@/lib/figma/fetch-file";
import type { ReferenceSnapshot } from "@/lib/types";
import { uniqueStrings } from "@/lib/utils";

function buildAliasMap(snapshot: ReferenceSnapshot) {
  const aliasMap: Record<string, string[]> = {};

  for (const token of snapshot.tokens) {
    const values = uniqueStrings([...(token.aliases ?? []), ...(token.codeHints ?? [])]);
    if (values.length > 0) {
      aliasMap[token.name] = values;
    }
  }

  return aliasMap;
}

export function normalizeFigmaReference(
  bundle: FigmaFileBundle,
  figmaFileKey: string,
): ReferenceSnapshot {
  const tokens = extractReferenceTokens(bundle);
  const components = extractComponentReferences(bundle, tokens);

  if (components.length === 0) {
    throw new FigmaSyncError(
      "Figma sync succeeded, but no components could be extracted from the file.",
    );
  }

  const snapshot: ReferenceSnapshot = {
    metadata: {
      source: "figma-api",
      versionLabel: bundle.file.version || bundle.file.name || "Figma sync",
      figmaFileKey,
      importedAt: new Date().toISOString(),
      fileName: bundle.file.name,
      lastModified: bundle.file.lastModified,
      componentCount: components.length,
      tokenCount: tokens.length,
    },
    tokens,
    components,
    aliasMap: {},
  };

  snapshot.aliasMap = buildAliasMap(snapshot);
  return snapshot;
}

export async function syncReferenceSnapshotFromFigma(figmaFileKey: string) {
  const bundle = await fetchFigmaFileBundle(figmaFileKey);
  return normalizeFigmaReference(bundle, figmaFileKey);
}
