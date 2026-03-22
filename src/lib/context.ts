import fs from 'node:fs';
import path from 'node:path';

import { readConfig } from './config';
import type { ReferenceSnapshot } from './types';
import { normalizeDesignMarkdownWithOptions } from './design-md/normalize';
import { syncReferenceSnapshotFromFigma } from './figma/normalize-reference';
import { normalizeStitchReference } from './stitch/normalize';

type DesignContextOptions = {
  cwd?: string;
};

function readIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function findFirstExisting(cwd: string, candidates: string[]) {
  for (const candidate of candidates) {
    const fullPath = path.join(cwd, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

function extractFileKey(url: string): string | null {
  const match = url.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
  return match ? match[2] : null;
}

export async function getDesignContext(options: DesignContextOptions = {}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const chunks: string[] = [];
  const config = readConfig(cwd);

  const configuredDesignPath = path.resolve(cwd, config.reference.path);
  const designPath = fs.existsSync(configuredDesignPath)
    ? configuredDesignPath
    : findFirstExisting(cwd, ['design.md', 'DESIGN.md']);
  if (designPath) {
    chunks.push(`DESIGN SPECIFICATION (from ${path.basename(designPath)}):\n${readIfExists(designPath)}`);
  }

  const cursorRulesPath = path.join(cwd, '.cursorrules');
  if (fs.existsSync(cursorRulesPath)) {
    chunks.push(`PROJECT RULES (from .cursorrules):\n${readIfExists(cursorRulesPath)}`);
  }

  return chunks.join('\n\n').trim();
}

export async function resolveReferenceSnapshot(cwd = process.cwd()): Promise<ReferenceSnapshot> {
  const config = readConfig(cwd);

  if (config.reference.sourceType === 'figma') {
    const figmaFileKey = config.reference.figmaFileKey || (config.reference.figmaUrl ? extractFileKey(config.reference.figmaUrl) : null);
    if (!figmaFileKey) {
      throw new Error('No Figma file key configured. Update design-memory.config.json and set reference.figmaFileKey or reference.figmaUrl.');
    }
    if (!process.env.FIGMA_ACCESS_TOKEN) {
      throw new Error('FIGMA_ACCESS_TOKEN is missing. Set it before running sync-reference for a Figma source.');
    }
    return syncReferenceSnapshotFromFigma(figmaFileKey);
  }

  const referencePath = config.reference.sourceType === 'stitch-markdown'
    ? config.reference.stitchPath || config.reference.path
    : config.reference.path;
  const resolvedPath = path.resolve(cwd, referencePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`No design source found at ${referencePath}. Update design-memory.config.json or add DESIGN.md.`);
  }

  const markdown = fs.readFileSync(resolvedPath, 'utf-8');
  if (config.reference.sourceType === 'stitch-markdown') {
    return normalizeStitchReference(markdown, {
      fileName: path.basename(resolvedPath),
    });
  }

  return normalizeDesignMarkdownWithOptions(markdown, path.basename(resolvedPath), {
    strict: config.reference.strictDesignMd,
  });
}
