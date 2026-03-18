import { figmaGet } from "@/lib/figma/client";

export type FigmaStyleMeta = {
  key?: string;
  name: string;
  styleType?: string;
  node_id?: string;
  description?: string;
};

export type FigmaComponentMeta = {
  key?: string;
  name: string;
  node_id?: string;
  description?: string;
  componentSetId?: string;
};

export type FigmaComponentSetMeta = {
  key?: string;
  name: string;
  node_id?: string;
  description?: string;
};

export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  styles?: Record<string, string>;
  fills?: Array<Record<string, unknown>>;
  strokes?: Array<Record<string, unknown>>;
  effects?: Array<Record<string, unknown>>;
  layoutMode?: string;
  cornerRadius?: number;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  componentPropertyDefinitions?: Record<string, { type?: string; defaultValue?: string }>;
  boundVariables?: Record<string, unknown>;
};

export type FigmaFileResponse = {
  name: string;
  lastModified?: string;
  version?: string;
  document: FigmaNode;
  components?: Record<string, FigmaComponentMeta>;
  componentSets?: Record<string, FigmaComponentSetMeta>;
  styles?: Record<string, FigmaStyleMeta>;
};

export type FigmaVariablesResponse = {
  meta?: {
    variableCollections?: Record<string, unknown>;
    variables?: Record<
      string,
      {
        id?: string;
        name?: string;
        resolvedType?: string;
        valuesByMode?: Record<string, unknown>;
      }
    >;
  };
};

export type FigmaFileBundle = {
  file: FigmaFileResponse;
  variables: FigmaVariablesResponse | null;
};

export async function fetchFigmaFile(fileKey: string) {
  return figmaGet<FigmaFileResponse>(`/files/${fileKey}?branch_data=true`);
}

export async function fetchFigmaLocalVariables(fileKey: string) {
  try {
    return await figmaGet<FigmaVariablesResponse>(`/files/${fileKey}/variables/local`);
  } catch {
    return null;
  }
}

export async function fetchFigmaFileBundle(fileKey: string): Promise<FigmaFileBundle> {
  const [file, variables] = await Promise.all([
    fetchFigmaFile(fileKey),
    fetchFigmaLocalVariables(fileKey),
  ]);

  return { file, variables };
}
