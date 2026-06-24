import { canonicalizeArrayPath } from "../utils/jsonPath.js";

export class UsedPathTracker {
  private readonly usedPaths = new Set<string>();
  private readonly rootIndices = new Map<string, number>();
  private activeArrayPrefix: string | null = null;

  getActiveArrayPrefix(): string | null {
    return this.activeArrayPrefix;
  }

  clearPagePrefix(): void {
    this.activeArrayPrefix = null;
  }

  isUsed(path: string): boolean {
    return this.usedPaths.has(path);
  }

  markUsed(path: string): void {
    this.usedPaths.add(path);
    const prefix = extractArrayRecordPrefix(path);
    if (prefix) this.activeArrayPrefix = prefix;
  }

  getIndexForRoot(sourceRoot: string): number {
    return this.rootIndices.get(sourceRoot) ?? 0;
  }

  getIndexForCanonical(canonicalPath: string): number {
    return this.rootIndices.get(canonicalPath) ?? 0;
  }

  advanceRoot(sourceRoot: string): void {
    this.rootIndices.set(sourceRoot, this.getIndexForRoot(sourceRoot) + 1);
  }

  registerResolvedPath(path: string): void {
    this.markUsed(path);
    const match = path.match(/^(.+)\[(\d+)\]/);
    if (!match) return;
    const rootKey = `${canonicalizeArrayPath(`${match[1]}[*]`)}`;
    const index = Number(match[2]);
    const current = this.rootIndices.get(rootKey) ?? 0;
    if (index >= current) this.rootIndices.set(rootKey, index);
  }
}

function extractArrayRecordPrefix(path: string): string | null {
  const match = path.match(/^(.+\[\d+\])/);
  return match?.[1] ?? null;
}
